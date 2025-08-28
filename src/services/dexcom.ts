import { httpsCallable } from 'firebase/functions';
import { functions, auth, db } from '../firebase/config';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { subDays, subHours } from 'date-fns';

// Interfaces
export interface DexcomGlucoseReading {
  systemTime: string;
  displayTime: string;
  value: number;
  trend: string;
  trendRate?: number;
}

export interface StoredGlucoseReading {
  userId: string;
  systemTime: Timestamp;
  displayTime: Timestamp;
  value: number;
  unit: string;
  trend: string;
  trendRate?: number;
  recordedAt: Timestamp;
}

export interface DexcomStats {
  average: number;
  timeInRange: number;
  estimatedHbA1c: number;
  lastReading: DexcomGlucoseReading | null;
  readingsCount: number;
  highReadings: number;
  lowReadings: number;
  normalReadings: number;
}

export interface DexcomConnectionStatus {
  connected: boolean;
  tokenExpired?: boolean;
  tokenExpiringSoon?: boolean;
  refreshTokenExpiringSoon?: boolean;
  expiresAt?: number;
  refreshTokenCreatedAt?: number;
}

/**
 * Simplified Dexcom service using Firebase Functions and Firestore
 */
export class DexcomService {
  private static instance: DexcomService;

  private constructor() {}

  public static getInstance(): DexcomService {
    if (!DexcomService.instance) {
      DexcomService.instance = new DexcomService();
    }
    return DexcomService.instance;
  }

  /**
   * Initiate OAuth flow with Dexcom
   */
  public async initiateOAuth(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    try {
      const startOAuth = httpsCallable(functions, 'dexcomOAuthStart');
      const result = await startOAuth();
      const { authUrl } = result.data as { authUrl: string };
      
      // Redirect user to Dexcom OAuth page
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Dexcom OAuth:', error);
      throw new Error('Failed to connect to Dexcom');
    }
  }

  /**
   * Check connection status with Dexcom
   */
  public async checkConnectionStatus(): Promise<DexcomConnectionStatus> {
    const user = auth.currentUser;
    if (!user) {
      return { connected: false };
    }

    try {
      const checkConnection = httpsCallable(functions, 'dexcomConnectionStatus');
      const result = await checkConnection();
      return result.data as DexcomConnectionStatus;
    } catch (error) {
      console.error('Error checking Dexcom connection:', error);
      return { connected: false };
    }
  }

  /**
   * Refresh Dexcom access token
   */
  public async refreshToken(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    try {
      const refreshToken = httpsCallable(functions, 'dexcomRefreshToken');
      await refreshToken();
      // console.log('Dexcom token refreshed successfully');
    } catch (error) {
      console.error('Error refreshing Dexcom token:', error);
      throw new Error('Failed to refresh Dexcom token');
    }
  }

  /**
   * Fetch glucose data from Dexcom API (stores in Firestore)
   */
  public async fetchGlucoseData(startDate?: Date, endDate?: Date): Promise<DexcomGlucoseReading[]> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    try {
      const fetchData = httpsCallable(functions, 'dexcomFetchGlucoseData');
      const params: Record<string, string> = {};
      
      if (startDate) {
        params.startDate = startDate.toISOString();
      }
      if (endDate) {
        params.endDate = endDate.toISOString();
      }

      const result = await fetchData(params);
      const responseData = result.data as { 
        glucoseData: DexcomGlucoseReading[];
        rateLimitRemaining?: number;
        rateLimitResetTime?: number;
      };
      
      // Log rate limit status if available
      if (responseData.rateLimitRemaining !== undefined) {
        // console.log(`Rate limit status: ${responseData.rateLimitRemaining} calls remaining`);
        
        if (responseData.rateLimitRemaining < 6000) {
          console.warn(`Approaching Dexcom rate limit! Only ${responseData.rateLimitRemaining} calls remaining.`);
        }
      }

      return responseData.glucoseData;
    } catch (error) {
      console.error('Error fetching Dexcom glucose data:', error);
      throw new Error('Failed to fetch glucose data');
    }
  }

  /**
   * Disconnect from Dexcom
   */
  public async disconnect(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    try {
      const disconnect = httpsCallable(functions, 'dexcomDisconnect');
      await disconnect();
      // console.log('Disconnected from Dexcom successfully');
    } catch (error) {
      console.error('Error disconnecting from Dexcom:', error);
      throw new Error('Failed to disconnect from Dexcom');
    }
  }

  /**
   * Subscribe to real-time glucose data from Firestore
   */
  public subscribeToGlucoseData(
    callback: (readings: DexcomGlucoseReading[]) => void,
    timeRange?: string,
    maxReadings: number = 288 // 24 hours of 5-minute readings
  ): () => void {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    // Calculate start date based on time range
    let startDate: Date | null = null;
    if (timeRange) {
      const now = new Date();
      switch (timeRange) {
        case 'last_twelve':
          startDate = subHours(now, 12);
          break;
        case 'last_week':
          startDate = subDays(now, 7);
          break;
        case 'last_month':
          startDate = subDays(now, 30);
          break;
        default:
          startDate = subHours(now, 12);
      }
    }

    // Build Firestore query
    let q = query(
      collection(db, 'glucoseReadings'),
      where('userId', '==', user.uid),
      orderBy('systemTime', 'desc'),
      limit(maxReadings)
    );

    // Add time range filter if specified
    if (startDate) {
      q = query(
        collection(db, 'glucoseReadings'),
        where('userId', '==', user.uid),
        where('systemTime', '>=', Timestamp.fromDate(startDate)),
        orderBy('systemTime', 'desc'),
        limit(maxReadings)
      );
    }

    // Set up real-time listener
    // console.log(`🔄 Setting up glucose subscription for ${timeRange}`);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const readings: DexcomGlucoseReading[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as StoredGlucoseReading;
        readings.push({
          systemTime: data.systemTime.toDate().toISOString(),
          displayTime: data.displayTime.toDate().toISOString(),
          value: data.value,
          trend: data.trend,
          trendRate: data.trendRate
        });
      });

      // Sort by time (most recent first)
      readings.sort((a, b) => new Date(b.systemTime).getTime() - new Date(a.systemTime).getTime());
      
      // console.log(`📊 Received ${readings.length} glucose readings for ${timeRange}`);
      callback(readings);
    }, (error) => {
      console.error('❌ Error in glucose data subscription:', error);
    });

    return unsubscribe;
  }

  /**
   * Get glucose data from Firestore (one-time fetch)
   */
  public async getGlucoseDataFromFirestore(
    timeRange?: string,
    maxReadings: number = 288
  ): Promise<DexcomGlucoseReading[]> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    // Calculate start date based on time range
    let startDate: Date | null = null;
    if (timeRange) {
      const now = new Date();
      switch (timeRange) {
        case 'last_twelve':
          startDate = subHours(now, 12);
          break;
        case 'last_week':
          startDate = subDays(now, 7);
          break;
        case 'last_month':
          startDate = subDays(now, 30);
          break;
        default:
          startDate = subHours(now, 12);
      }
    }

    // Build Firestore query
    let q = query(
      collection(db, 'glucoseReadings'),
      where('userId', '==', user.uid),
      orderBy('systemTime', 'desc'),
      limit(maxReadings)
    );

    // Add time range filter if specified
    if (startDate) {
      q = query(
        collection(db, 'glucoseReadings'),
        where('userId', '==', user.uid),
        where('systemTime', '>=', Timestamp.fromDate(startDate)),
        orderBy('systemTime', 'desc'),
        limit(maxReadings)
      );
    }

    try {
      const snapshot = await getDocs(q);
      const readings: DexcomGlucoseReading[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data() as StoredGlucoseReading;
        readings.push({
          systemTime: data.systemTime.toDate().toISOString(),
          displayTime: data.displayTime.toDate().toISOString(),
          value: data.value,
          trend: data.trend,
          trendRate: data.trendRate
        });
      });

      // Sort by time (most recent first)
      readings.sort((a, b) => new Date(b.systemTime).getTime() - new Date(a.systemTime).getTime());
      
      return readings;
    } catch (error) {
      console.error('Error fetching glucose data from Firestore:', error);
      throw new Error('Failed to fetch glucose data from database');
    }
  }

  /**
   * Filter glucose data by time range
   */
  public filterDataByTimeRange(
    data: DexcomGlucoseReading[],
    timeRange: string
  ): DexcomGlucoseReading[] {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case 'last_twelve':
        startDate = subHours(now, 12);
        break;
      case 'last_week':
        startDate = subDays(now, 7);
        break;
      case 'last_month':
        startDate = subDays(now, 30);
        break;
      case 'all_time':
        return data;
      default:
        startDate = subHours(now, 12);
    }

    return data.filter(reading => {
      const readingDate = new Date(reading.displayTime);
      return readingDate >= startDate;
    });
  }

  /**
   * Calculate statistics for glucose data
   */
  public calculateStats(data: DexcomGlucoseReading[]): DexcomStats {
    if (!data || data.length === 0) {
      return {
        average: 0,
        timeInRange: 0,
        estimatedHbA1c: 0,
        lastReading: null,
        readingsCount: 0,
        highReadings: 0,
        lowReadings: 0,
        normalReadings: 0,
      };
    }

    // Sort by time to get the latest reading
    const sortedData = [...data].sort((a, b) => 
      new Date(b.displayTime).getTime() - new Date(a.displayTime).getTime()
    );

    const lastReading = sortedData[0];
    const readingsCount = data.length;

    // Calculate average
    const total = data.reduce((sum, reading) => sum + reading.value, 0);
    const average = total / readingsCount;

    // Calculate time in range (70-180 mg/dL)
    const inRangeCount = data.filter(reading => 
      reading.value >= 70 && reading.value <= 180
    ).length;
    const timeInRange = (inRangeCount / readingsCount) * 100;

    // Calculate high/low readings
    const highReadings = data.filter(reading => reading.value > 180).length;
    const lowReadings = data.filter(reading => reading.value < 70).length;
    const normalReadings = inRangeCount;

    // Estimate HbA1c using the formula: HbA1c = (average + 46.7) / 28.7
    const estimatedHbA1c = (average + 46.7) / 28.7;

    return {
      average: Math.round(average),
      timeInRange: Math.round(timeInRange * 10) / 10,
      estimatedHbA1c: Math.round(estimatedHbA1c * 10) / 10,
      lastReading,
      readingsCount,
      highReadings,
      lowReadings,
      normalReadings,
    };
  }

  /**
   * Test function to get raw Dexcom API response for debugging
   */
  public async testRawData(startDate?: Date, endDate?: Date): Promise<unknown> {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated');
    }

    try {
      const testRawData = httpsCallable(functions, 'dexcomTestRawData');
      const params: Record<string, string> = {};
      
      if (startDate) {
        params.startDate = startDate.toISOString();
      }
      if (endDate) {
        params.endDate = endDate.toISOString();
      }

      const result = await testRawData(params);
      // console.log('Raw test data result:', result.data);
      return result.data;
    } catch (error) {
      console.error('Error calling test raw data function:', error);
      throw new Error('Failed to fetch test raw data');
    }
  }

  /**
   * Get trend arrow for display
   */
  public getTrendArrow(trend: string): string {
    const trendMap: { [key: string]: string } = {
      'None': '→',
      'DoubleUp': '↑↑',
      'SingleUp': '↑',
      'FortyFiveUp': '↗',
      'Flat': '→',
      'FortyFiveDown': '↘',
      'SingleDown': '↓',
      'DoubleDown': '↓↓',
      'NotComputable': '?',
      'RateOutOfRange': '?',
    };

    return trendMap[trend] || '→';
  }

  /**
   * Format glucose value for display
   */
  public formatGlucoseValue(value: number): string {
    return `${value} mg/dL`;
  }

  /**
   * Get glucose reading color based on value
   */
  public getGlucoseColor(value: number): string {
    if (value < 70) return 'text-red-600';
    if (value > 180) return 'text-yellow-600';
    return 'text-green-600';
  }
}