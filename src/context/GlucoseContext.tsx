import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { GoogleSheetsService, GlucoseReading, GlucoseStats } from '../services/googleSheets';
import { useAuth } from './AuthContext';

interface GlucoseContextType {
  glucoseData: GlucoseReading[]; // Raw unfiltered data
  filteredData: GlucoseReading[]; // Filtered by timeRange
  stats: GlucoseStats;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  timeRange: string;
  setTimeRange: (range: string) => void;
  refreshData: () => Promise<void>;
}

const GlucoseContext = createContext<GlucoseContextType | undefined>(undefined);

export const useGlucose = () => {
  const context = useContext(GlucoseContext);
  if (context === undefined) {
    throw new Error('useGlucose must be used within a GlucoseProvider');
  }
  return context;
};

interface GlucoseProviderProps {
  children: ReactNode;
}

export const GlucoseProvider: React.FC<GlucoseProviderProps> = ({ children }) => {
  const [glucoseData, setGlucoseData] = useState<GlucoseReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('last_twelve');
  
  const { isAuthenticated, loading: authLoading } = useAuth();
  const googleSheetsService = GoogleSheetsService.getInstance();

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    
    try {
      const data = await googleSheetsService.fetchGlucoseData();
      setGlucoseData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching glucose data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch glucose data');
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [googleSheetsService]);

  const refreshData = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    // Only fetch data when user is authenticated and auth is not loading
    if (isAuthenticated && !authLoading) {
      fetchData(false);
    } else if (!authLoading && !isAuthenticated) {
      // If not authenticated, reset loading state
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authLoading]);

  // Calculate filtered data and stats based on current time range
  const filteredData = googleSheetsService.filterDataByTimeRange(glucoseData, timeRange);
  const stats = googleSheetsService.calculateStats(filteredData);

  const value: GlucoseContextType = {
    glucoseData,
    filteredData,
    stats,
    loading,
    refreshing,
    error,
    timeRange,
    setTimeRange,
    refreshData,
  };

  return (
    <GlucoseContext.Provider value={value}>
      {children}
    </GlucoseContext.Provider>
  );
};