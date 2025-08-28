import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { DexcomService, DexcomGlucoseReading, DexcomStats, DexcomConnectionStatus } from '../services/dexcom';
import { subDays, subHours } from 'date-fns';

interface DexcomApiResponse {
  sandbox?: boolean;
  datesAdjusted?: boolean;
  adjustedDateRange?: {
    originalStart: string;
    originalEnd: string;
    adjustedStart: string;
    adjustedEnd: string;
  };
  availableDataRange?: {
    start: string;
    end: string;
  };
}

interface DexcomContextType {
  glucoseData: DexcomGlucoseReading[];
  stats: DexcomStats;
  loading: boolean;
  error: string | null;
  connected: boolean;
  connectionLoading: boolean;
  timeRange: string;
  setTimeRange: (range: string) => void;
  refreshData: () => Promise<void>;
  connectToDexcom: () => Promise<void>;
  disconnectFromDexcom: () => Promise<void>;
  checkConnectionStatus: () => Promise<void>;
}

const DexcomContext = createContext<DexcomContextType | undefined>(undefined);

export const useDexcom = () => {
  const context = useContext(DexcomContext);
  if (context === undefined) {
    throw new Error('useDexcom must be used within a DexcomProvider');
  }
  return context;
};

interface DexcomProviderProps {
  children: ReactNode;
}

// Helper function to get start and end dates based on time range
const getTimeRangeDates = (timeRange: string): { startDate: Date; endDate: Date } => {
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
      startDate = subDays(now, 365); // 1 year for all time
      break;
    default:
      startDate = subHours(now, 12);
  }
  
  return { startDate, endDate: now };
};

export const DexcomProvider: React.FC<DexcomProviderProps> = ({ children }) => {
  // State
  const [glucoseData, setGlucoseData] = useState<DexcomGlucoseReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('last_twelve');
  
  // Services
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const dexcomService = useMemo(() => DexcomService.getInstance(), []);
  
  // Firestore real-time subscription
  useEffect(() => {
    if (!user || !connected) {
      // console.log('🕒 Clearing glucose data - user not connected');
      setGlucoseData([]);
      return;
    }

    const unsubscribe = dexcomService.subscribeToGlucoseData(
      (readings) => {
        setGlucoseData(readings);
        setError(null);
        
        // If no data is available on initial subscription, try to fetch fresh data
        if (readings.length === 0) {
          // console.log('No stored data found, fetching from Dexcom API...');
          const { startDate, endDate } = getTimeRangeDates(timeRange);
          dexcomService.fetchGlucoseData(startDate, endDate).catch(error => {
            console.error('Failed to fetch fresh data:', error);
          });
        }
      },
      timeRange
    );

    return unsubscribe;
  }, [user, connected, timeRange, dexcomService]);

  const refreshData = useCallback(async () => {
    if (!user) {
      return;
    }
    
    if (!connected) {
      // console.log('Not connected, skipping data refresh');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Fetch fresh data from Dexcom API (this will also store it in Firestore)
      // The real-time subscription will automatically update the UI
      const { startDate, endDate } = getTimeRangeDates(timeRange);
      // console.log(`Fetching glucose data for time range: ${timeRange}`, {
      //   startDate: startDate.toISOString(),
      //   endDate: endDate.toISOString()
      // });
      const result = await dexcomService.fetchGlucoseData(startDate, endDate);
      
      // console.log('Fresh data fetched from Dexcom API');
      
      // Check if we got any data
      if (!result || result.length === 0) {
        // console.log('No glucose data available from Dexcom API');
        
        // Check if this is a sandbox response with additional info
        
        const responseInfo = result as DexcomGlucoseReading[] & DexcomApiResponse;
        let errorMessage = 'No glucose data available. ';
        
        if (responseInfo?.sandbox) {
          errorMessage += 'SANDBOX ENVIRONMENT:\n';
          errorMessage += '• Sandbox has limited test data for specific date ranges only\n';
          errorMessage += '• Data repeats every 10-day sensor session cycle\n';
          
          if (responseInfo?.datesAdjusted) {
            errorMessage += '• Requested dates were automatically adjusted to match available data\n';
            errorMessage += `• Original: ${responseInfo.adjustedDateRange?.originalStart} to ${responseInfo.adjustedDateRange?.originalEnd}\n`;
            errorMessage += `• Adjusted: ${responseInfo.adjustedDateRange?.adjustedStart} to ${responseInfo.adjustedDateRange?.adjustedEnd}\n`;
          }
          
          if (responseInfo?.availableDataRange) {
            errorMessage += `• Available data: ${responseInfo.availableDataRange.start} to ${responseInfo.availableDataRange.end}\n`;
          }
          
          errorMessage += '\nTry selecting "All Time" to see available test data.';
        } else {
          errorMessage += 'This could be because:\n';
          errorMessage += '• Your Dexcom sensor is not active\n';
          errorMessage += '• No recent glucose readings\n';
          errorMessage += '• Sensor is in warm-up period\n';
          errorMessage += '\nPlease ensure your Dexcom sensor is active and try again.';
        }
        
        setError(errorMessage);
      } else if ((result as DexcomGlucoseReading[] & DexcomApiResponse)?.datesAdjusted) {
        // Show info message if dates were adjusted but we got data
        // const responseInfo = result as DexcomGlucoseReading[] & DexcomApiResponse;
        // console.log('📦 Sandbox: Dates were adjusted to match available data', responseInfo.adjustedDateRange);
        // You could add a toast notification here if desired
      }
    } catch (err) {
      console.error('Error refreshing Dexcom data:', err);
      setError(err instanceof Error ? err.message : 'Failed to refresh glucose data');
      
      // If it's an auth error, update connection status
      if (err instanceof Error && err.message.includes('authentication')) {
        setConnected(false);
      }
    } finally {
      setLoading(false);
    }
  }, [user, connected, timeRange, dexcomService]);

  const checkConnectionStatus = useCallback(async () => {
    if (!user) {
      setConnected(false);
      setConnectionLoading(false);
      return;
    }

    try {
      setConnectionLoading(true);
      setError(null);
      
      const status: DexcomConnectionStatus = await dexcomService.checkConnectionStatus();
      // console.log('Connection status response:', status);
      
      if (status.connected) {
        if (status.refreshTokenExpiringSoon) {
          setError('Your Dexcom authorization will expire soon. Please reconnect to maintain access.');
          setConnected(false);
        } else if (status.tokenExpired) {
          // console.log('Token expired, attempting refresh...');
          try {
            await dexcomService.refreshToken();
            // Re-check status after refresh
            const refreshedStatus = await dexcomService.checkConnectionStatus();
            setConnected(refreshedStatus.connected);
            if (!refreshedStatus.connected) {
              setError('Token refresh failed. Please reconnect to Dexcom.');
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            setConnected(false);
            setError('Session expired. Please reconnect to Dexcom.');
          }
        } else {
          // console.log('Setting connected to true');
          setConnected(true);
          setError(null);
        }
      } else {
        // console.log('Setting connected to false - no tokens');
        setConnected(false);
        setError(null);
      }
    } catch (err) {
      console.error('Error checking Dexcom connection:', err);
      setConnected(false);
      setError('Failed to check connection status');
    } finally {
      setConnectionLoading(false);
    }
  }, [user, dexcomService]);

  // Check URL for OAuth success/error on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const errorParam = urlParams.get('error');

    if (success === 'true') {
      // console.log('OAuth success detected in URL');
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      // Handle OAuth success: check connection and fetch data
      const handleOAuthSuccess = async () => {
        try {
          // console.log('Handling OAuth success - checking connection status...');
          await checkConnectionStatus();
          
          // After connection is confirmed, fetch glucose data
          // console.log('Connection confirmed, fetching glucose data...');
          await refreshData();
          // console.log('OAuth success handling complete');
        } catch (error) {
          console.error('Error handling OAuth success:', error);
          setError('Connected to Dexcom but failed to fetch data. Please try refreshing.');
        }
      };
      
      handleOAuthSuccess();
    } else if (errorParam) {
      console.error('OAuth error detected in URL:', errorParam);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      
      let userFriendlyError = 'Failed to connect to Dexcom';
      switch (errorParam) {
        case 'access_denied':
          userFriendlyError = 'Access denied. Please authorize the application to access your Dexcom data.';
          break;
        case 'invalid_state':
          userFriendlyError = 'Security error. Please try connecting again.';
          break;
        case 'token_exchange_failed':
          userFriendlyError = 'Failed to exchange authorization code. Please try again.';
          break;
        case 'missing_parameters':
          userFriendlyError = 'Missing required parameters. Please try connecting again.';
          break;
        case 'internal_error':
          userFriendlyError = 'Internal server error. Please try again later.';
          break;
      }
      
      setError(userFriendlyError);
      setConnectionLoading(false);
    }
  }, [checkConnectionStatus, refreshData]);

  // Check connection status when user changes
  useEffect(() => {
    if (isAuthenticated && !authLoading && user) {
      checkConnectionStatus();
    } else if (!authLoading && !isAuthenticated) {
      setConnected(false);
      setGlucoseData([]);
      setConnectionLoading(false);
      setError(null);
    }
  }, [user, isAuthenticated, authLoading, checkConnectionStatus]);

  // Auto-refresh connection status periodically (every 10 minutes)
  useEffect(() => {
    if (!isAuthenticated || authLoading || !user) return;

    const interval = setInterval(() => {
      // Only check if we're currently connected to avoid spam
      if (connected) {
        checkConnectionStatus();
      }
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [user, isAuthenticated, authLoading, connected, checkConnectionStatus]);

  const connectToDexcom = async () => {
    if (!user) {
      setError('User must be authenticated to connect to Dexcom');
      return;
    }

    try {
      setConnectionLoading(true);
      setError(null);
      
      // This will redirect to Dexcom OAuth
      await dexcomService.initiateOAuth();
    } catch (err) {
      console.error('Error connecting to Dexcom:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to Dexcom');
      setConnectionLoading(false);
    }
  };

  const disconnectFromDexcom = async () => {
    if (!user) return;

    try {
      setConnectionLoading(true);
      setError(null);
      
      await dexcomService.disconnect();
      setConnected(false);
      setGlucoseData([]);
      setError(null);
    } catch (err) {
      console.error('Error disconnecting from Dexcom:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect from Dexcom');
    } finally {
      setConnectionLoading(false);
    }
  };

  // Calculate stats based on current glucose data
  const stats = dexcomService.calculateStats(glucoseData);

  const value: DexcomContextType = {
    glucoseData,
    stats,
    loading,
    error,
    connected,
    connectionLoading,
    timeRange,
    setTimeRange,
    refreshData,
    connectToDexcom,
    disconnectFromDexcom,
    checkConnectionStatus,
  };

  return (
    <DexcomContext.Provider value={value}>
      {children}
    </DexcomContext.Provider>
  );
};