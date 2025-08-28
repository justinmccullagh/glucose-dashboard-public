# Dexcom G7 Integration Setup and Architecture Guide

## Overview

This document provides comprehensive setup instructions and technical details for the Dexcom G7 API integration with the glucose dashboard. The integration uses Firebase Functions for secure server-side OAuth handling and Firestore for encrypted token storage.

## Prerequisites

1. **Dexcom Developer Account**: Required for API access credentials
2. **Firebase Project**: Already configured with Blaze plan (pay-as-you-go)
3. **Firebase Functions**: For secure OAuth flow and token management
4. **Firestore**: For encrypted token and glucose data storage

## Architecture Overview

### Data Flow Architecture

```
User ←→ Frontend (React) ←→ Firebase Functions ←→ Dexcom API
                ↓                   ↓
            Firebase Auth        Firestore
                                (Encrypted Storage)
```

### Core Components

1. **Frontend (React)**: User interface and Firebase Authentication
2. **Firebase Functions**: Secure OAuth handling and API proxy
3. **Firestore**: Encrypted token storage and glucose data cache
4. **Dexcom API v3**: Real-time glucose data source

## Setup Steps

### 1. Dexcom Developer Portal Configuration

1. Go to [Dexcom Developer Portal](https://developer.dexcom.com/)
2. Create a new application or use your existing one
3. Configure the following settings:
   - **Redirect URI**: `https://your-project.cloudfunctions.net/dexcomOAuthCallback`
   - **Scopes**: `offline_access` (enables refresh tokens for long-term access)
   - **Application Type**: Web Application

4. Note down your credentials:
   - **Client ID**: Public identifier for your application
   - **Client Secret**: Private key for secure authentication
   - **Redirect URI**: OAuth callback endpoint

### 2. Firebase Functions Configuration

**Environment Variables Setup**:
```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Set Dexcom credentials as environment variables (preferred method)
export DEXCOM_CLIENT_ID="your_dexcom_client_id"
export DEXCOM_CLIENT_SECRET="your_dexcom_client_secret"
export DEXCOM_REDIRECT_URI="https://your-project.cloudfunctions.net/dexcomOAuthCallback"
export DEXCOM_USE_SANDBOX="false"  # Set to true for testing/sandbox
export DEXCOM_FRONTEND_URL="http://localhost:5173"  # Your frontend URL
```

**Deploy Firebase Functions**:
```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions for testing
firebase deploy --only functions:dexcomOAuthStart,dexcomOAuthCallback,dexcomFetchGlucoseData
```

### 3. Frontend Environment Variables

Update your `.env` file:
```env
# Firebase Configuration (already configured)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id

# Dexcom Configuration (optional - handled by Functions)
VITE_DEXCOM_ENABLED=true
```

## How It Works: Technical Implementation

### OAuth 2.0 Flow (Detailed)

1. **User Initiation**:
   - User clicks "Connect to Dexcom" in the React frontend
   - Frontend calls `DexcomService.initiateOAuth()`

2. **OAuth URL Generation**:
   - Frontend invokes Firebase Function `dexcomOAuthStart`
   - Function generates secure CSRF state parameter
   - Returns Dexcom OAuth URL with state parameter
   - User is redirected to Dexcom authorization page

3. **User Authorization**:
   - User logs into Dexcom and grants permissions
   - Dexcom redirects to Firebase Function callback URL
   - Authorization code and state parameter are included

4. **Token Exchange**:
   - Firebase Function `dexcomOAuthCallback` validates state parameter
   - Exchanges authorization code for access/refresh tokens
   - Validates token response from Dexcom API

5. **Secure Token Storage**:
   - Tokens are encrypted and stored in Firestore
   - Each user's tokens are isolated by Firebase Auth UID
   - Refresh token enables long-term access (1 year)

6. **Data Access**:
   - Frontend can now fetch glucose data via Firebase Functions
   - Functions handle token validation and refresh automatically

### Firestore Data Structure

```
Collections:
├── dexcomTokens/           # Encrypted OAuth tokens
│   └── {userId}/
│       ├── accessToken     # Encrypted access token
│       ├── refreshToken    # Encrypted refresh token
│       ├── expiresAt       # Token expiry timestamp
│       └── lastRefresh     # Last refresh timestamp
│
├── glucoseReadings/        # Cached glucose data
│   └── {userId}_{timestamp}/
│       ├── userId          # Firebase Auth UID
│       ├── systemTime      # Dexcom system timestamp
│       ├── displayTime     # User-friendly timestamp
│       ├── value           # Glucose value (mg/dL)
│       ├── trend           # Trend direction
│       └── trendRate       # Rate of change
│
├── rateLimits/             # API rate limiting
│   └── global/
│       ├── calls           # Array of recent API calls
│       └── lastReset       # Last reset timestamp
│
└── healthMetrics/          # System health monitoring
    └── {metricId}/
        ├── operation       # Function name
        ├── success         # Success/failure flag
        ├── responseTime    # API response time
        └── timestamp       # When recorded
```

### Firebase Functions Architecture

#### Core Functions:

1. **`dexcomOAuthStart`**: Initiates OAuth flow with secure state generation
2. **`dexcomOAuthCallback`**: Handles OAuth callback and token exchange
3. **`dexcomConnectionStatus`**: Checks token validity and connection status
4. **`dexcomFetchGlucoseData`**: Fetches glucose data with automatic token refresh
5. **`dexcomRefreshToken`**: Manually refreshes expired tokens
6. **`dexcomDisconnect`**: Securely removes user tokens
7. **`scheduledGlucoseDataPull`**: Automated data fetching every 15 minutes

#### Security Features:

- **CSRF Protection**: Secure state parameter validation
- **Token Encryption**: All tokens encrypted before Firestore storage
- **User Isolation**: Firestore security rules prevent cross-user access
- **Rate Limiting**: Built-in API rate limiting (60,000 calls/hour)
- **Automatic Token Refresh**: Handles expired tokens transparently
- **Error Handling**: Comprehensive error handling with user-friendly messages

### Frontend Integration

#### DexcomService Class (`src/services/dexcom.ts`):

```typescript
// Key Methods:
- initiateOAuth(): Starts OAuth flow
- checkConnectionStatus(): Validates connection
- fetchGlucoseData(): Fetches data via Firebase Functions
- subscribeToGlucoseData(): Real-time Firestore subscription
- calculateStats(): Computes glucose statistics
- disconnect(): Removes connection
```

#### DexcomContext (`src/context/DexcomContext.tsx`):

- Manages global Dexcom state
- Handles authentication status
- Provides real-time data subscriptions
- Integrates with dashboard components

### Firestore Security Rules

Current rules ensure:
- Users can only access their own tokens and data
- Authenticated users required for all operations
- Write permissions limited to user's own documents

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Dexcom tokens - user can only access their own
    match /dexcomTokens/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Glucose readings - user can only access their own
    match /glucoseReadings/{readingId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == resource.data.userId;
    }
  }
}
```

### Testing the Integration

1. **Start Development Server**:
   ```bash
   npm run dev
   ```

2. **Navigate to Dexcom Dashboard**:
   - Go to `/dexcom` in your application
   - Click "Connect to Dexcom"
   - Complete the OAuth flow in Dexcom's interface

3. **Verify Integration**:
   - Check Firestore for stored tokens (encrypted)
   - Verify glucose data appears in dashboard
   - Test automatic data refresh
   - Monitor Firebase Functions logs

4. **Debug Tools**:
   ```bash
   # View Firebase Functions logs
   firebase functions:log
   
   # Test configuration
   curl https://your-project.cloudfunctions.net/testConfig
   ```

## API Limits and Rate Limiting

### Dexcom API Limits
- **Rate Limit**: 60,000 API calls per hour per application
- **Token Lifespan**: Access tokens expire after 1 hour
- **Refresh Token**: Valid for 1 year from creation
- **Data Range**: Can fetch up to 1 year of historical data
- **Frequency**: Glucose readings every 1-5 minutes (depending on sensor)
- **Current Time Ranges**: Only "Last 12 Hours" enabled (Last Week/Month commented out)

### Built-in Rate Limiting
The integration implements intelligent rate limiting:
- Tracks API calls per hour in Firestore
- Prevents exceeding Dexcom's 60,000 calls/hour limit
- Automatic backoff when approaching limits
- Health monitoring for API performance

### Scheduled Data Fetching
- **Frequency**: Every 15 minutes via Firebase Pub/Sub
- **Scope**: Fetches last hour of data for all connected users
- **Efficiency**: Only stores new readings (duplicate prevention)
- **Reliability**: Continues on individual user failures

## Cost Estimation

### Firebase Costs (Personal Use)
Based on typical glucose monitoring patterns:

- **Firebase Functions**: 
  - ~2,000 invocations/month
  - Cost: ~$0.01/month
  
- **Firestore**: 
  - ~8,640 reads/month (real-time subscriptions)
  - ~2,000 writes/month (new glucose readings)
  - Cost: ~$0.02/month
  
- **Firebase Authentication**: Free (up to 10,000 monthly active users)

**Total Estimated Cost**: ~$0.05/month (likely within free tier)

### Dexcom API Costs
- **Sandbox**: Free for development and testing
- **Production**: Free for personal use (subject to rate limits)

## Sandbox vs Production Environment

### Sandbox Environment
- **Purpose**: Development and testing
- **Data**: Limited synthetic test data
- **Availability**: 24/7 access
- **Rate Limits**: Same as production (60,000/hour)
- **Data Range**: Typically covers 10-day sensor sessions
- **URL**: `https://sandbox-api.dexcom.com`

### Production Environment
- **Purpose**: Real glucose data from user's Dexcom G7
- **Data**: Live sensor readings
- **Requirements**: Valid Dexcom Share/Follow setup
- **Rate Limits**: 60,000 calls/hour
- **URL**: `https://api.dexcom.com`

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. OAuth Flow Failures
**Symptoms**: Redirect loops, "invalid_state" errors
**Solutions**:
- Verify `DEXCOM_REDIRECT_URI` matches exactly in Dexcom Developer Portal
- Check Firebase Functions are deployed and accessible
- Ensure state parameter validation is working

#### 2. Token Refresh Issues
**Symptoms**: "Token expired" errors, authentication failures
**Solutions**:
- Verify refresh token hasn't expired (1-year limit)
- Check Dexcom API credentials are correct
- Monitor Firebase Functions logs for detailed errors

#### 3. No Glucose Data
**Symptoms**: Successful connection but no readings
**Solutions**:
- **Sandbox**: Use available date ranges (check `/dataRange` endpoint)
- **Production**: Ensure Dexcom Share is enabled and sensor is active
- Verify time range parameters are correct

#### 4. Firestore Permission Denied
**Symptoms**: Database read/write errors
**Solutions**:
- Verify user is authenticated with Firebase Auth
- Check Firestore security rules are properly configured
- Ensure user UID matches document ownership

### Debug Commands

```bash
# View real-time Firebase Functions logs
firebase functions:log --follow

# Test Firebase Functions configuration
curl https://your-project.cloudfunctions.net/testConfig

# Check specific function deployment
firebase functions:log --only dexcomFetchGlucoseData

# Validate Firestore rules
firebase firestore:rules:validate
```

### Error Codes Reference

| Code | Description | Solution |
|------|-------------|----------|
| 400 | Bad Request | Check date parameters and format |
| 401 | Unauthorized | Refresh or reconnect Dexcom tokens |
| 403 | Forbidden | Verify API permissions and scopes |
| 429 | Rate Limited | Wait for rate limit reset (1 hour) |
| 500 | Server Error | Check Firebase Functions logs |

## Production Deployment Checklist

### Pre-Production Steps
1. **Environment Configuration**:
   ```bash
   export DEXCOM_USE_SANDBOX="false"
   export DEXCOM_FRONTEND_URL="https://your-production-domain.com"
   ```

2. **Dexcom Developer Portal**:
   - Update redirect URI to production Firebase Functions URL
   - Apply for production API access if required
   - Verify rate limits for production usage

3. **Firebase Configuration**:
   - Deploy functions to production Firebase project
   - Update Firestore security rules for production
   - Configure production authentication domains

4. **Testing**:
   - Test complete OAuth flow in production
   - Verify real glucose data fetching
   - Monitor error rates and performance

### Post-Deployment Monitoring

1. **Health Metrics**: Monitor via `healthMetrics` Firestore collection
2. **Error Tracking**: Set up Firebase Functions error reporting
3. **Rate Limit Monitoring**: Track API usage patterns
4. **User Authentication**: Monitor Firebase Auth logs
5. **Debug Logging**: Console.log statements are commented out in production for clean output

## Advanced Features

### Real-time Data Streaming
Current implementation uses:
- **Firestore Real-time Listeners**: Instant updates when new data arrives
- **Scheduled Functions**: Automated data fetching every 15 minutes
- **Manual Refresh**: User-initiated data fetching

### Data Synchronization
- **Duplicate Prevention**: Unique document IDs prevent duplicate readings
- **Time Zone Handling**: Proper handling of system vs display time
- **Batch Operations**: Efficient bulk data storage

### Future Enhancements
- **WebSocket Integration**: Real-time push notifications
- **Advanced Analytics**: Machine learning on glucose patterns
- **Multi-sensor Support**: Support for multiple Dexcom devices
- **Data Export**: CSV/JSON export functionality

## Support and Resources

### Documentation Links
- [Dexcom Developer Portal](https://developer.dexcom.com/)
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)

### Community Support
- [Dexcom Developer Forums](https://developer.dexcom.com/forums)
- [Firebase Community](https://firebase.google.com/community)

For technical issues specific to this implementation, check the project's GitHub issues or Firebase Functions logs for detailed error information.
