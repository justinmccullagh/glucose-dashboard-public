import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as cors from 'cors';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Firebase Admin
admin.initializeApp();

// Configure CORS
const corsHandler = cors({ origin: true });

// Initialize Firestore
const db = admin.firestore();

// Dexcom API configuration constants
const DEXCOM_API_CONFIG = {
  SANDBOX_BASE_URL: 'https://sandbox-api.dexcom.com',
  PRODUCTION_BASE_URL: 'https://api.dexcom.com',
  TOKEN_EXPIRY_BUFFER_MS: 30 * 60 * 1000, // 30 minutes before expiry
  REFRESH_TOKEN_EXPIRY_MS: 365 * 24 * 60 * 60 * 1000, // 1 year
  RATE_LIMIT_MAX_CALLS: 60000, // 60,000 calls per hour per Dexcom docs
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000, // 1 hour
};

// Firestore collection names
const COLLECTIONS = {
  DEXCOM_TOKENS: 'dexcomTokens',
  GLUCOSE_READINGS: 'glucoseReadings',
  RATE_LIMITS: 'rateLimits',
  HEALTH_METRICS: 'healthMetrics',
};

// Interfaces
interface DexcomTokens {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshTokenCreatedAt: number;
  lastRefresh?: number;
  createdAt: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
}

interface DexcomGlucoseReading {
  systemTime: string;
  displayTime: string;
  value: number;
  trend: string;
  trendRate?: number;
}

interface StoredGlucoseReading {
  userId: string;
  systemTime: FirebaseFirestore.Timestamp;
  displayTime: FirebaseFirestore.Timestamp;
  value: number;
  unit: string;
  trend: string;
  trendRate?: number;
  recordedAt: FirebaseFirestore.FieldValue;
}

interface DexcomApiError {
  status: number;
  message: string;
  userMessage: string;
  isRetryable: boolean;
}

// Error handling utilities
const DEXCOM_ERROR_CODES: Record<number, { message: string; userMessage: string; isRetryable: boolean }> = {
  400: { message: 'Bad Request - Invalid parameters', userMessage: 'Invalid request parameters', isRetryable: false },
  401: { message: 'Unauthorized - Invalid or expired token', userMessage: 'Authentication expired. Please reconnect.', isRetryable: false },
  403: { message: 'Forbidden - Insufficient permissions', userMessage: 'Access denied. Please check permissions.', isRetryable: false },
  404: { message: 'Not Found - Endpoint or resource not found', userMessage: 'Requested data not found', isRetryable: false },
  409: { message: 'Conflict - Resource conflict', userMessage: 'Data conflict occurred', isRetryable: false },
  429: { message: 'Too Many Requests - Rate limit exceeded', userMessage: 'Too many requests. Please try again later.', isRetryable: true },
  500: { message: 'Internal Server Error - Dexcom API error', userMessage: 'Dexcom service temporarily unavailable', isRetryable: true },
  502: { message: 'Bad Gateway - Upstream server error', userMessage: 'Service temporarily unavailable', isRetryable: true },
  503: { message: 'Service Unavailable - Dexcom maintenance', userMessage: 'Dexcom service under maintenance', isRetryable: true },
  504: { message: 'Gateway Timeout - Request timeout', userMessage: 'Request timed out. Please try again.', isRetryable: true }
};

function handleDexcomError(response: Response): DexcomApiError {
  const status = response.status;
  const errorInfo = DEXCOM_ERROR_CODES[status] || {
    message: `HTTP ${status} - Unknown error`,
    userMessage: 'An unexpected error occurred',
    isRetryable: false
  };
  
  return {
    status,
    message: errorInfo.message,
    userMessage: errorInfo.userMessage,
    isRetryable: errorInfo.isRetryable
  };
}

// Security utilities
function generateSecureState(userId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const stateData = {
    userId,
    timestamp,
    nonce
  };
  return Buffer.from(JSON.stringify(stateData)).toString('base64');
}

function validateState(state: string, expectedUserId: string): { valid: boolean; reason?: string } {
  try {
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    
    if (!stateData.userId || !stateData.timestamp || !stateData.nonce) {
      return { valid: false, reason: 'Missing required state fields' };
    }
    
    if (stateData.userId !== expectedUserId) {
      return { valid: false, reason: 'User ID mismatch' };
    }
    
    // Check timestamp (max 1 hour for security)
    const now = Date.now();
    const stateAge = now - stateData.timestamp;
    if (stateAge > 60 * 60 * 1000) {
      return { valid: false, reason: 'State parameter expired' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid state format' };
  }
}

// Token management utilities
async function getUserTokens(userId: string): Promise<DexcomTokens | null> {
  try {
    const doc = await db.collection(COLLECTIONS.DEXCOM_TOKENS).doc(userId).get();
    return doc.exists ? doc.data() as DexcomTokens : null;
  } catch (error) {
    console.error('Error getting user tokens:', error);
    return null;
  }
}

async function saveUserTokens(userId: string, tokens: Partial<DexcomTokens>): Promise<void> {
  try {
    const tokenData: DexcomTokens = {
      userId,
      accessToken: tokens.accessToken!,
      refreshToken: tokens.refreshToken!,
      expiresAt: tokens.expiresAt!,
      refreshTokenCreatedAt: tokens.refreshTokenCreatedAt || Date.now(),
      lastRefresh: Date.now(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection(COLLECTIONS.DEXCOM_TOKENS).doc(userId).set(tokenData);
    console.log(`Tokens saved for user ${userId}`);
  } catch (error) {
    console.error('Error saving user tokens:', error);
    throw error;
  }
}

async function deleteUserTokens(userId: string): Promise<void> {
  try {
    await db.collection(COLLECTIONS.DEXCOM_TOKENS).doc(userId).delete();
    console.log(`Tokens deleted for user ${userId}`);
  } catch (error) {
    console.error('Error deleting user tokens:', error);
    throw error;
  }
}

// Rate limiting utilities
async function checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const windowStart = now - DEXCOM_API_CONFIG.RATE_LIMIT_WINDOW_MS;
  
  const rateLimitDoc = db.collection(COLLECTIONS.RATE_LIMITS).doc('global');
  
  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitDoc);
      const data = doc.exists ? doc.data() : { calls: [], lastReset: now };
      
      // Remove calls outside the current window
      const recentCalls = (data?.calls || []).filter((timestamp: number) => timestamp > windowStart);
      
      // Check if we're within limits
      const remaining = DEXCOM_API_CONFIG.RATE_LIMIT_MAX_CALLS - recentCalls.length;
      const allowed = remaining > 0;
      
      if (allowed) {
        // Add this call to the list
        recentCalls.push(now);
        
        // Update the document
        transaction.set(rateLimitDoc, {
          calls: recentCalls,
          lastReset: now,
          lastCall: now
        });
      }
      
      return {
        allowed,
        remaining: Math.max(0, remaining),
        resetTime: now + DEXCOM_API_CONFIG.RATE_LIMIT_WINDOW_MS
      };
    });
    
    return result;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Allow the call if rate limit check fails (fail open)
    return { allowed: true, remaining: DEXCOM_API_CONFIG.RATE_LIMIT_MAX_CALLS, resetTime: now + DEXCOM_API_CONFIG.RATE_LIMIT_WINDOW_MS };
  }
}

// Health monitoring utilities
async function recordHealthMetric(operation: string, success: boolean, responseTime?: number, error?: string): Promise<void> {
  try {
    await db.collection(COLLECTIONS.HEALTH_METRICS).add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      operation,
      success,
      responseTime: responseTime || 0,
      error: error || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Failed to record health metric:', error);
  }
}

// Glucose data storage utilities
async function storeGlucoseReadings(userId: string, readings: DexcomGlucoseReading[]): Promise<void> {
  if (readings.length === 0) {
    console.log('No readings to store');
    return;
  }
  
  const batch = db.batch();
  
  for (const reading of readings) {
    try {
      // Create unique document ID using userId and systemTime to prevent duplicates
      const docId = `${userId}_${new Date(reading.systemTime).getTime()}`;
      const docRef = db.collection(COLLECTIONS.GLUCOSE_READINGS).doc(docId);
      
      const storedReading: StoredGlucoseReading = {
        userId,
        systemTime: admin.firestore.Timestamp.fromDate(new Date(reading.systemTime)),
        displayTime: admin.firestore.Timestamp.fromDate(new Date(reading.displayTime)),
        value: reading.value,
        unit: 'mg/dL',
        trend: reading.trend,
        trendRate: reading.trendRate,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      batch.set(docRef, storedReading, { merge: true });
    } catch (error) {
      console.error(`Error processing reading for storage:`, error);
      throw error;
    }
  }
  
  try {
    await batch.commit();
    console.log(`✅ Stored ${readings.length} glucose readings`);
  } catch (error) {
    console.error(`❌ Failed to commit batch to Firestore:`, error);
    throw error;
  }
}

// DataRange interface for Dexcom API response
interface DexcomDataRange {
  egvs?: {
    start?: {
      systemTime: string;
      displayTime: string;
    };
    end?: {
      systemTime: string;
      displayTime: string;
    };
  };
  calibrations?: {
    start?: {
      systemTime: string;
      displayTime: string;
    };
    end?: {
      systemTime: string;
      displayTime: string;
    };
  };
  events?: {
    start?: {
      systemTime: string;
      displayTime: string;
    };
    end?: {
      systemTime: string;
      displayTime: string;
    };
  };
}

// Get available data ranges from Dexcom API
async function getDexcomDataRange(accessToken: string, baseUrl: string): Promise<DexcomDataRange | null> {
  try {
    console.log('Fetching data range from Dexcom API...');
    const response = await fetch(`${baseUrl}/v3/users/self/dataRange`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch data range:', response.status, await response.text());
      return null;
    }

    const dataRange = await response.json() as DexcomDataRange;
    console.log('Available data range:', JSON.stringify(dataRange, null, 2));
    return dataRange;
  } catch (error) {
    console.error('Error fetching data range:', error);
    return null;
  }
}

// Adjust date ranges for sandbox environment based on available data
function adjustDatesForSandbox(
  requestedStartDate: Date, 
  requestedEndDate: Date, 
  dataRange: DexcomDataRange | null, 
  useSandbox: boolean
): { startDate: Date; endDate: Date; adjusted: boolean } {
  
  if (!useSandbox || !dataRange?.egvs?.start || !dataRange?.egvs?.end) {
    return { startDate: requestedStartDate, endDate: requestedEndDate, adjusted: false };
  }

  const availableStart = new Date(dataRange.egvs.start.systemTime);
  const availableEnd = new Date(dataRange.egvs.end.systemTime);
  
  console.log('Sandbox data adjustment:', {
    requested: `${requestedStartDate.toISOString()} to ${requestedEndDate.toISOString()}`,
    available: `${availableStart.toISOString()} to ${availableEnd.toISOString()}`
  });

  // If requested range is completely outside available range, use most recent available data
  if (requestedStartDate > availableEnd || requestedEndDate < availableStart) {
    console.log('Requested range outside available data, using most recent available range');
    // Use the last 12 hours of available data
    const duration = Math.min(12 * 60 * 60 * 1000, availableEnd.getTime() - availableStart.getTime());
    return {
      startDate: new Date(availableEnd.getTime() - duration),
      endDate: availableEnd,
      adjusted: true
    };
  }

  // Clamp the dates to available range
  const adjustedStart = new Date(Math.max(requestedStartDate.getTime(), availableStart.getTime()));
  const adjustedEnd = new Date(Math.min(requestedEndDate.getTime(), availableEnd.getTime()));
  
  const wasAdjusted = adjustedStart.getTime() !== requestedStartDate.getTime() || 
                     adjustedEnd.getTime() !== requestedEndDate.getTime();

  if (wasAdjusted) {
    console.log('Dates adjusted to fit available data:', {
      adjustedStart: adjustedStart.toISOString(),
      adjustedEnd: adjustedEnd.toISOString()
    });
  }

  return {
    startDate: adjustedStart,
    endDate: adjustedEnd,
    adjusted: wasAdjusted
  };
}

// Dexcom API utilities
function getDexcomConfig() {
  // Try environment variables first, then fall back to Firebase config
  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;
  const redirectUri = process.env.DEXCOM_REDIRECT_URI;
  const useSandbox = process.env.DEXCOM_USE_SANDBOX === 'false';
  const frontendUrl = process.env.DEXCOM_FRONTEND_URL || 'https://glucose-dashboard-409e6.web.app';
  
  console.log('Dexcom config check:', {
    clientId: clientId ? '***' : 'MISSING',
    clientSecret: clientSecret ? '***' : 'MISSING',
    redirectUri: redirectUri || 'MISSING',
    useSandbox,
    frontendUrl
  });
  
  if (clientId && clientSecret && redirectUri) {
    return {
      clientId,
      clientSecret,
      redirectUri,
      useSandbox,
      frontendUrl
    };
  }
  
  // Fall back to Firebase config (legacy)
  const config = functions.config();
  console.log('Falling back to Firebase config');
  return {
    clientId: config.dexcom?.client_id,
    clientSecret: config.dexcom?.client_secret,
    redirectUri: config.dexcom?.redirect_uri,
    useSandbox: config.dexcom?.use_sandbox === 'false',
    frontendUrl: config.dexcom?.frontend_url || 'https://glucose-dashboard-409e6.web.app'
  };
}

function getDexcomBaseUrl(useSandbox: boolean): string {
  return useSandbox ? DEXCOM_API_CONFIG.SANDBOX_BASE_URL : DEXCOM_API_CONFIG.PRODUCTION_BASE_URL;
}

async function refreshAccessToken(userId: string, refreshToken: string): Promise<DexcomTokens> {
  const config = getDexcomConfig();
  const baseUrl = getDexcomBaseUrl(config.useSandbox);
  
  console.log(`Refreshing access token for user ${userId}`);
  
  const response = await fetch(`${baseUrl}/v2/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  
  if (!response.ok) {
    const dexcomError = handleDexcomError(response);
    const errorText = await response.text();
    console.error(`Token refresh failed: ${dexcomError.message}`, errorText);
    throw new functions.https.HttpsError('internal', dexcomError.userMessage);
  }
  
  const tokenData = await response.json();
  
  const newTokens: DexcomTokens = {
    userId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
    refreshTokenCreatedAt: Date.now(), // Track when refresh token was created
    lastRefresh: Date.now(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  await saveUserTokens(userId, newTokens);
  return newTokens;
}

// Cloud Functions

/**
 * Initiate OAuth flow with Dexcom
 */
export const dexcomOAuthStart = functions.https.onCall(async (_, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  console.log(`Starting OAuth flow for user ${userId}`);
  
  const config = getDexcomConfig();
  
  if (!config.clientId || !config.redirectUri) {
    throw new functions.https.HttpsError('failed-precondition', 'Dexcom API credentials not configured');
  }
  
  // Generate secure state parameter for CSRF protection
  const state = generateSecureState(userId);
  
  // Construct OAuth URL
  const baseUrl = getDexcomBaseUrl(config.useSandbox);
  const authUrl = `${baseUrl}/v2/oauth2/login?` +
    `client_id=${config.clientId}&` +
    `redirect_uri=${encodeURIComponent(config.redirectUri)}&` +
    `response_type=code&` +
    `scope=offline_access&` +
    `state=${state}`;
  
  console.log('Generated OAuth URL for user', userId);
  return { authUrl };
});

/**
 * Handle OAuth callback and exchange code for tokens
 */
export const dexcomOAuthCallback = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      const { code, state, error } = req.query;
      
      console.log('OAuth callback received:', { hasCode: !!code, hasState: !!state, error });
      console.log('Code value:', code ? 'present' : 'missing');
      console.log('State value:', state ? 'present' : 'missing');
      
      // Validate configuration early
      const dexcomConfig = getDexcomConfig();
      if (!dexcomConfig.clientId || !dexcomConfig.clientSecret || !dexcomConfig.redirectUri) {
        console.error('Missing Dexcom configuration:', {
          hasClientId: !!dexcomConfig.clientId,
          hasClientSecret: !!dexcomConfig.clientSecret,
          hasRedirectUri: !!dexcomConfig.redirectUri
        });
        res.redirect(`${dexcomConfig.frontendUrl || 'http://localhost:5173'}/dexcom?error=configuration_error`);
        return;
      }
      
      if (error) {
        console.error('OAuth error:', error);
        res.redirect(`${dexcomConfig.frontendUrl}/dexcom?error=${encodeURIComponent(error as string)}`);
        return;
      }
      
      if (!code || !state) {
        console.error('Missing code or state');
        const config = getDexcomConfig();
        res.redirect(`${config.frontendUrl}/dexcom?error=missing_parameters`);
        return;
      }
      
      // Validate state parameter
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      } catch {
        console.error('Invalid state parameter format');
        const config = getDexcomConfig();
        res.redirect(`${config.frontendUrl}/dexcom?error=invalid_state`);
        return;
      }
      
      const { userId } = stateData;
      if (!userId) {
        console.error('No userId in state');
        const config = getDexcomConfig();
        res.redirect(`${config.frontendUrl}/dexcom?error=invalid_state`);
        return;
      }
      
      const stateValidation = validateState(state as string, userId);
      if (!stateValidation.valid) {
        console.error('State validation failed:', stateValidation.reason);
        const config = getDexcomConfig();
        res.redirect(`${config.frontendUrl}/dexcom?error=invalid_state`);
        return;
      }
      
      // Exchange code for tokens
      const config = getDexcomConfig();
      const baseUrl = getDexcomBaseUrl(config.useSandbox);
      
      console.log('Exchanging code for tokens...');
      console.log('Using sandbox URL:', baseUrl);
      console.log('Client ID configured:', config.clientId ? 'YES' : 'NO');
      const tokenResponse = await fetch(`${baseUrl}/v2/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: config.redirectUri!,
        }),
      });
      
      if (!tokenResponse.ok) {
        const dexcomError = handleDexcomError(tokenResponse);
        const errorText = await tokenResponse.text();
        console.error(`Token exchange failed: ${dexcomError.message}`, { status: tokenResponse.status, body: errorText });
        res.redirect(`${config.frontendUrl}/dexcom?error=token_exchange_failed`);
        return;
      }
      
      const tokenData = await tokenResponse.json();
      console.log('Token exchange successful');
      
      // Store tokens in Firestore
      const tokens: Partial<DexcomTokens> = {
        userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        refreshTokenCreatedAt: Date.now(),
      };
      
      console.log(`Token exchange successful, attempting to store tokens for user ${userId}`);
      try {
        await saveUserTokens(userId, tokens);
        console.log(`Tokens stored successfully for user ${userId}`);
      } catch (firestoreError) {
        console.error('Firestore save failed:', firestoreError);
        // Continue anyway for now to test the OAuth flow
        console.log('Continuing despite Firestore error...');
      }
      
      // Redirect to frontend with success
      res.redirect(`${config.frontendUrl}/dexcom?success=true`);
      
    } catch (error) {
      console.error('Error in OAuth callback:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        name: error instanceof Error ? error.name : 'Unknown'
      });
      const config = getDexcomConfig();
      res.redirect(`${config.frontendUrl}/dexcom?error=internal_error`);
    }
  });
});

/**
 * Check Dexcom connection status
 */
export const dexcomConnectionStatus = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  console.log(`Checking connection status for user ${userId}`);
  
  try {
    const tokens = await getUserTokens(userId);
    
    if (!tokens) {
      console.log(`No tokens found for user ${userId}`);
      return { connected: false };
    }
    
    const now = Date.now();
    const isExpired = now >= tokens.expiresAt;
    const willExpireSoon = now + DEXCOM_API_CONFIG.TOKEN_EXPIRY_BUFFER_MS >= tokens.expiresAt;
    
    // Check if refresh token is nearing 1-year expiration
    const refreshTokenAge = now - tokens.refreshTokenCreatedAt;
    const refreshTokenExpiringSoon = refreshTokenAge > (DEXCOM_API_CONFIG.REFRESH_TOKEN_EXPIRY_MS - 7 * 24 * 60 * 60 * 1000);
    
    console.log(`Tokens found for user ${userId}, expired: ${isExpired}`);
    return {
      connected: true,
      tokenExpired: isExpired,
      tokenExpiringSoon: willExpireSoon,
      refreshTokenExpiringSoon,
      expiresAt: tokens.expiresAt,
      refreshTokenCreatedAt: tokens.refreshTokenCreatedAt
    };
  } catch (error) {
    console.error(`Error checking connection status for user ${userId}:`, error);
    // Return false instead of throwing to avoid breaking the UI
    return { connected: false, error: 'Database connection failed' };
  }
});

/**
 * Refresh Dexcom access token
 */
export const dexcomRefreshToken = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const tokens = await getUserTokens(userId);
  
  if (!tokens || !tokens.refreshToken) {
    throw new functions.https.HttpsError('not-found', 'No refresh token found. Please reconnect to Dexcom.');
  }
  
  try {
    await refreshAccessToken(userId, tokens.refreshToken);
    return { success: true };
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw error;
  }
});

/**
 * Fetch glucose data from Dexcom API v3
 * 
 * This function fetches estimated glucose values (EGVs) from the Dexcom API
 * and stores them in Firestore for real-time access by the frontend.
 * 
 * @param data - Optional object containing:
 *   - startDate (string): ISO 8601 date string for start of range
 *   - endDate (string): ISO 8601 date string for end of range
 *   - If not provided, defaults to last 12 hours
 * @param context - Firebase Functions context with user authentication
 * 
 * @returns Promise<{glucoseData: DexcomGlucoseReading[], rateLimitRemaining: number, rateLimitResetTime: number}>
 * 
 * Date Format Requirements:
 * - API expects full ISO 8601 format with timezone: "2025-01-09T12:34:56.789Z"
 * - Supports date ranges up to 1 year
 * - Dates cannot be before 2020-01-01
 * - Dates cannot be in the future
 * 
 * Rate Limiting:
 * - Dexcom API allows 60,000 calls per hour
 * - Function implements client-side rate limiting
 * 
 * Error Handling:
 * - Validates all date parameters
 * - Provides specific error messages for date-related issues
 * - Automatically refreshes expired tokens
 * 
 * @throws {functions.https.HttpsError} Various errors for authentication, validation, and API issues
 */
export const dexcomFetchGlucoseData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  let tokens = await getUserTokens(userId);
  
  if (!tokens) {
    throw new functions.https.HttpsError('not-found', 'No Dexcom tokens found. Please connect to Dexcom first.');
  }
  
  // Check rate limits
  const rateLimitCheck = await checkRateLimit();
  if (!rateLimitCheck.allowed) {
    await recordHealthMetric('dexcom_glucose_fetch', false, 0, 'Rate limit exceeded');
    throw new functions.https.HttpsError('resource-exhausted', 'API rate limit exceeded. Please try again later.');
  }
  
  // Refresh token if expired or expiring soon
  const now = Date.now();
  if (now >= tokens.expiresAt || now + DEXCOM_API_CONFIG.TOKEN_EXPIRY_BUFFER_MS >= tokens.expiresAt) {
    console.log('Token expired or expiring soon, refreshing...');
    tokens = await refreshAccessToken(userId, tokens.refreshToken);
  }
  
  const startTime = Date.now();
  
  try {
    const { startDate, endDate } = data || {};
    
    // Log incoming request parameters for debugging
    console.log(`dexcomFetchGlucoseData called for user ${userId}`, {
      hasStartDate: !!startDate,
      hasEndDate: !!endDate,
      startDateValue: startDate,
      endDateValue: endDate,
      dataKeys: Object.keys(data || {})
    });
    
    const config = getDexcomConfig();
    const baseUrl = getDexcomBaseUrl(config.useSandbox);
    
    // For sandbox environment, first get available data ranges
    let dataRange: DexcomDataRange | null = null;
    if (config.useSandbox) {
      console.log('Sandbox environment detected, fetching available data ranges...');
      dataRange = await getDexcomDataRange(tokens.accessToken, baseUrl);
      
      if (!dataRange) {
        console.warn('Could not fetch data range for sandbox environment');
      }
    }
    
    // Format dates for Dexcom API
    const formatDexcomDate = (date: Date): string => {
      // Dexcom API expects local time format: 2022-02-06T09:12:35
      // Convert to local time instead of UTC
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      const formatted = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
      console.log(`Formatting date: ${date.toISOString()} -> ${formatted} (local time)`);
      return formatted;
    };
    
    // Parse and validate date parameters
    let parsedStartDate: Date;
    let parsedEndDate: Date;
    
    if (startDate && endDate) {
      // Use provided dates
      parsedStartDate = new Date(startDate);
      parsedEndDate = new Date(endDate);
    } else {
      // Default to last 12 hours if no dates provided (matches default frontend timeRange)
      const now = new Date();
      parsedStartDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      parsedEndDate = now;
    }
    
    // Validate dates
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      console.error('Invalid date format detected:', {
        startDate: startDate,
        endDate: endDate,
        parsedStartDate: parsedStartDate,
        parsedEndDate: parsedEndDate
      });
      throw new functions.https.HttpsError('invalid-argument', 'Invalid date format provided');
    }
    
    // Additional validation - ensure dates are reasonable
    const minAllowedDate = new Date('2020-01-01'); // Dexcom G7 wasn't available before 2020
    
    if (parsedStartDate < minAllowedDate) {
      throw new functions.https.HttpsError('invalid-argument', 'Start date cannot be before 2020');
    }
    
    if (parsedEndDate < minAllowedDate) {
      throw new functions.https.HttpsError('invalid-argument', 'End date cannot be before 2020');
    }
    
    if (parsedStartDate >= parsedEndDate) {
      throw new functions.https.HttpsError('invalid-argument', 'Start date must be before end date');
    }
    
    // Check date range limits (Dexcom API may have limits)
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000; // 1 year max
    if (parsedEndDate.getTime() - parsedStartDate.getTime() > maxRangeMs) {
      throw new functions.https.HttpsError('invalid-argument', 'Date range cannot exceed 1 year');
    }
    
    // For sandbox environment, adjust dates based on available data
    let finalStartDate = parsedStartDate;
    let finalEndDate = parsedEndDate;
    let datesWereAdjusted = false;
    
    if (config.useSandbox && dataRange) {
      const adjustment = adjustDatesForSandbox(parsedStartDate, parsedEndDate, dataRange, config.useSandbox);
      finalStartDate = adjustment.startDate;
      finalEndDate = adjustment.endDate;
      datesWereAdjusted = adjustment.adjusted;
      
      if (datesWereAdjusted) {
        console.log('Dates were adjusted for sandbox environment');
      }
    } else {
      // For production environment, ensure dates are not in the future
      const now = new Date();
      console.log('Date validation check:', {
        now: now.toISOString(),
        parsedStartDate: parsedStartDate.toISOString(),
        parsedEndDate: parsedEndDate.toISOString(),
        startDateInFuture: parsedStartDate > now,
        endDateInFuture: parsedEndDate > now
      });
      
      if (parsedStartDate > now) {
        throw new functions.https.HttpsError('invalid-argument', 'Start date cannot be in the future');
      }
      if (parsedEndDate > now) {
        console.log('Clamping end date to now');
        finalEndDate = now; // Clamp end date to now
      }
    }
    
    const formattedStartDate = formatDexcomDate(finalStartDate);
    const formattedEndDate = formatDexcomDate(finalEndDate);
    
    const params = new URLSearchParams({
      startDate: formattedStartDate,
      endDate: formattedEndDate,
    });
    
    // Log final processed parameters
    console.log(`Fetching glucose data for user ${userId}`);
    console.log(`Date range: ${formattedStartDate} to ${formattedEndDate}`);
    console.log(`Date range duration: ${(finalEndDate.getTime() - finalStartDate.getTime()) / (1000 * 60 * 60)} hours`);
    console.log(`API URL: ${baseUrl}/v3/users/self/egvs?${params}`);
    console.log(`Using sandbox: ${config.useSandbox}`);
    if (datesWereAdjusted) {
      console.log('⚠️  Dates were adjusted for sandbox environment - using available data range instead of requested dates');
    }
    
    const response = await fetch(`${baseUrl}/v3/users/self/egvs?${params}`, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const dexcomError = handleDexcomError(response);
      const errorText = await response.text();
      console.error(`Dexcom API error: ${dexcomError.message}`, { 
        status: response.status, 
        body: errorText,
        dateRange: `${formattedStartDate} to ${formattedEndDate}`,
        userId: userId
      });
      
      // Enhanced error handling for date-related issues
      if (response.status === 400) {
        console.error('Dexcom API 400 error details:', {
          errorText,
          sentParams: {
            startDate: formattedStartDate,
            endDate: formattedEndDate
          },
          url: `${baseUrl}/v3/users/self/egvs?${params}`
        });
        
        if (errorText.includes('date')) {
          await recordHealthMetric('dexcom_glucose_fetch', false, responseTime, 'Invalid date parameters');
          throw new functions.https.HttpsError('invalid-argument', 
            `Invalid date parameters sent to Dexcom API. Sent: ${formattedStartDate} to ${formattedEndDate}. API response: ${errorText}`);
        }
      }
      
      await recordHealthMetric('dexcom_glucose_fetch', false, responseTime, dexcomError.message);
      throw new functions.https.HttpsError('failed-precondition', dexcomError.userMessage);
    }
    
    const responseData = await response.json();
    // Support both old (egvs) and new (records) API response formats
    const glucoseData = responseData.records || responseData.egvs || [];
    
    // Clean API response logging
    console.log(`Dexcom API Response: ${response.status} - ${glucoseData.length} readings fetched`);
    console.log(`API Format: ${responseData.records ? 'NEW (records)' : responseData.egvs ? 'OLD (egvs)' : 'UNKNOWN'}`);
    
    if (glucoseData.length > 0) {
      const firstReading = glucoseData[0];
      const lastReading = glucoseData[glucoseData.length - 1];
      console.log(`Data range: ${firstReading.systemTime} to ${lastReading.systemTime}`);
    }
    
    // Removed verbose logging - keeping it clean
    
    console.log(`Successfully fetched ${glucoseData.length} glucose readings`);
    
    // Store glucose data in Firestore
    try {
      await storeGlucoseReadings(userId, glucoseData);
      console.log(`✅ Successfully stored ${glucoseData.length} readings in Firestore`);
    } catch (error) {
      console.error(`❌ Failed to store glucose readings:`, error);
      throw new functions.https.HttpsError('internal', 'Failed to store glucose data');
    }
    
    // Log additional context if no data was found
    if (glucoseData.length === 0) {
      console.log('No glucose data found - this could indicate:');
      
      if (config.useSandbox) {
        console.log('📦 SANDBOX ENVIRONMENT:');
        console.log('• Sandbox has limited test data for specific date ranges only');
        console.log('• Data repeats every 10-day sensor session cycle');
        console.log('• Use /dataRange endpoint to see available dates');
        if (dataRange) {
          console.log('• Available data range:', {
            start: dataRange.egvs?.start?.systemTime,
            end: dataRange.egvs?.end?.systemTime
          });
        }
        if (datesWereAdjusted) {
          console.log('• Dates were automatically adjusted but still no data found');
        }
      } else {
        console.log('🏥 PRODUCTION ENVIRONMENT:');
        console.log('• No glucose readings in the requested time range');
        console.log('• Dexcom sensor may not be active or transmitting');
        console.log('• User may need to wait for sensor warm-up period');
      }
      
      console.log('• Date format or timezone issues with API request');
      console.log(`• Requested date range: ${formattedStartDate} to ${formattedEndDate}`);
      console.log(`• Range duration: ${(finalEndDate.getTime() - finalStartDate.getTime()) / (1000 * 60 * 60)} hours`);
    }
    
    await recordHealthMetric('dexcom_glucose_fetch', true, responseTime);
    
    return {
      glucoseData,
      rateLimitRemaining: rateLimitCheck.remaining,
      rateLimitResetTime: rateLimitCheck.resetTime,
      // Include sandbox-specific information
      sandbox: config.useSandbox,
      datesAdjusted: datesWereAdjusted,
      adjustedDateRange: datesWereAdjusted ? {
        originalStart: startDate,
        originalEnd: endDate,
        adjustedStart: formattedStartDate,
        adjustedEnd: formattedEndDate
      } : undefined,
      availableDataRange: config.useSandbox && dataRange ? {
        start: dataRange.egvs?.start?.systemTime,
        end: dataRange.egvs?.end?.systemTime
      } : undefined
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Error fetching Dexcom glucose data:', error);
    
    if (!(error instanceof functions.https.HttpsError)) {
      await recordHealthMetric('dexcom_glucose_fetch', false, responseTime, error instanceof Error ? error.message : 'Unknown error');
    }
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Failed to fetch glucose data');
  }
});

/**
 * Disconnect from Dexcom
 */
export const dexcomDisconnect = functions.https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  
  try {
    await deleteUserTokens(userId);
    console.log(`Dexcom disconnected for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error('Error disconnecting from Dexcom:', error);
    throw new functions.https.HttpsError('internal', 'Failed to disconnect from Dexcom');
  }
});

/**
 * Scheduled function to pull glucose data for all connected users
 */
export const scheduledGlucoseDataPull = functions.pubsub.schedule('every 15 minutes').onRun(async () => {
  console.log('Starting scheduled glucose data pull...');
  
  try {
    // Get all users with Dexcom tokens
    const tokensSnapshot = await db.collection(COLLECTIONS.DEXCOM_TOKENS).get();
    
    if (tokensSnapshot.empty) {
      console.log('No users with Dexcom tokens found');
      return;
    }
    
    const pullPromises = tokensSnapshot.docs.map(async (doc) => {
      const tokens = doc.data() as DexcomTokens;
      const userId = tokens.userId;
      
      try {
        console.log(`Pulling data for user ${userId}`);
        
        // Check rate limits
        const rateLimitCheck = await checkRateLimit();
        if (!rateLimitCheck.allowed) {
          console.warn(`Rate limit exceeded, skipping user ${userId}`);
          return;
        }
        
        // Refresh token if needed
        let currentTokens = tokens;
        const now = Date.now();
        if (now >= currentTokens.expiresAt || now + DEXCOM_API_CONFIG.TOKEN_EXPIRY_BUFFER_MS >= currentTokens.expiresAt) {
          console.log(`Refreshing token for user ${userId}`);
          currentTokens = await refreshAccessToken(userId, currentTokens.refreshToken);
        }
        
        // Fetch glucose data
        const config = getDexcomConfig();
        const baseUrl = getDexcomBaseUrl(config.useSandbox);
        
        const formatDexcomDate = (date: Date): string => {
          // Use local time format for consistency
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          
          return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        };
        
        // Get data from last hour to capture new readings
        const startDate = formatDexcomDate(new Date(Date.now() - 60 * 60 * 1000));
        const endDate = formatDexcomDate(new Date());
        
        const params = new URLSearchParams({
          startDate,
          endDate,
        });
        
        const response = await fetch(`${baseUrl}/v3/users/self/egvs?${params}`, {
          headers: {
            'Authorization': `Bearer ${currentTokens.accessToken}`,
          },
        });
        
        if (response.ok) {
          const responseData = await response.json();
          // Support both old (egvs) and new (records) API response formats
          const glucoseData = responseData.records || responseData.egvs || [];
          
          if (glucoseData.length > 0) {
            await storeGlucoseReadings(userId, glucoseData);
            console.log(`Stored ${glucoseData.length} new readings for user ${userId}`);
          }
        } else {
          console.error(`Failed to fetch data for user ${userId}:`, response.status);
        }
        
      } catch (error) {
        console.error(`Error pulling data for user ${userId}:`, error);
      }
    });
    
    await Promise.all(pullPromises);
    console.log('Completed scheduled glucose data pull');
    
  } catch (error) {
    console.error('Error in scheduled glucose data pull:', error);
  }
});

/**
 * Test function to verify Firebase Functions are working
 */
export const testFunction = functions.https.onCall(async () => {
  const config = getDexcomConfig();
  return { 
    success: true, 
    message: 'Firebase Functions is working!', 
    timestamp: Date.now(),
    dexcomConfigured: !!(config.clientId && config.clientSecret && config.redirectUri),
    environment: {
      hasClientId: !!config.clientId,
      hasClientSecret: !!config.clientSecret,
      hasRedirectUri: !!config.redirectUri,
      useSandbox: config.useSandbox,
      frontendUrl: config.frontendUrl
    }
  };
});

/**
 * Test function to return raw Dexcom API response without storing in Firestore
 * Use this for debugging the data structure and API response
 */
export const dexcomTestRawData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  let tokens = await getUserTokens(userId);
  
  if (!tokens) {
    throw new functions.https.HttpsError('not-found', 'No Dexcom tokens found. Please connect to Dexcom first.');
  }
  
  // Refresh token if expired
  const now = Date.now();
  if (now >= tokens.expiresAt || now + DEXCOM_API_CONFIG.TOKEN_EXPIRY_BUFFER_MS >= tokens.expiresAt) {
    console.log('Token expired or expiring soon, refreshing...');
    tokens = await refreshAccessToken(userId, tokens.refreshToken);
  }
  
  const startTime = Date.now();
  
  try {
    const { startDate, endDate } = data || {};
    
    console.log(`=== DEXCOM TEST RAW DATA FUNCTION ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Start Date: ${startDate}`);
    console.log(`End Date: ${endDate}`);
    
    const config = getDexcomConfig();
    const baseUrl = getDexcomBaseUrl(config.useSandbox);
    
    // Use default date range if not provided
    let parsedStartDate: Date;
    let parsedEndDate: Date;
    
    if (startDate && endDate) {
      parsedStartDate = new Date(startDate);
      parsedEndDate = new Date(endDate);
    } else {
      const now = new Date();
      parsedStartDate = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
      parsedEndDate = now;
    }
    
    // Format dates for Dexcom API
    const formatDexcomDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    };
    
    const formattedStartDate = formatDexcomDate(parsedStartDate);
    const formattedEndDate = formatDexcomDate(parsedEndDate);
    
    const params = new URLSearchParams({
      startDate: formattedStartDate,
      endDate: formattedEndDate,
    });
    
    console.log(`Making API call to: ${baseUrl}/v3/users/self/egvs?${params}`);
    
    const response = await fetch(`${baseUrl}/v3/users/self/egvs?${params}`, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
      },
    });
    
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API Error: ${response.status} - ${errorText}`);
      throw new functions.https.HttpsError('failed-precondition', `API Error: ${response.status}`);
    }
    
    const responseData = await response.json();
    
    // Support both old (egvs) and new (records) API response formats
    const glucoseData = responseData.records || responseData.egvs || [];
    
    console.log(`Test API Response: ${response.status} - ${glucoseData.length} readings found`);
    
    return {
      success: true,
      statusCode: response.status,
      responseTime,
      rawResponse: responseData,
      parsedGlucoseData: glucoseData,
      dataLength: glucoseData.length,
      sandbox: config.useSandbox,
      dateRange: {
        start: formattedStartDate,
        end: formattedEndDate
      },
      // Debug info about API format
      apiFormat: responseData.records ? 'NEW (records)' : responseData.egvs ? 'OLD (egvs)' : 'UNKNOWN'
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('Error in test function:', error);
    console.error('Response time:', responseTime);
    throw new functions.https.HttpsError('internal', 'Failed to fetch test data');
  }
});

/**
 * Simple HTTP test endpoint to check configuration
 */
export const testConfig = functions.https.onRequest((req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const config = getDexcomConfig();
    res.json({
      success: true,
      message: 'Configuration test',
      timestamp: Date.now(),
      dexcomConfigured: !!(config.clientId && config.clientSecret && config.redirectUri),
      environment: {
        hasClientId: !!config.clientId,
        hasClientSecret: !!config.clientSecret,
        hasRedirectUri: !!config.redirectUri,
        useSandbox: config.useSandbox,
        frontendUrl: config.frontendUrl,
        processEnv: {
          hasClientId: !!process.env.DEXCOM_CLIENT_ID,
          hasClientSecret: !!process.env.DEXCOM_CLIENT_SECRET,
          hasRedirectUri: !!process.env.DEXCOM_REDIRECT_URI
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});