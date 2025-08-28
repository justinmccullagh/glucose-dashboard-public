import { useState, useEffect } from 'react';
import { GoogleSheetsService, GlucoseReading } from '../services/googleSheets';
import { useAuth } from '../context/AuthContext';

interface UseCalendarDataReturn {
  calendarData: GlucoseReading[];
  loading: boolean;
  error: string | null;
  refreshCalendarData: () => Promise<void>;
}

export const useCalendarData = (): UseCalendarDataReturn => {
  const [calendarData, setCalendarData] = useState<GlucoseReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { isAuthenticated, loading: authLoading } = useAuth();
  const googleSheetsService = GoogleSheetsService.getInstance();

  const fetchCalendarData = async () => {
    setLoading(true);
    try {
      // console.log('useCalendarData: Fetching all glucose data for calendar...');
      const data = await googleSheetsService.fetchGlucoseData();
      // console.log('useCalendarData: Received data:', data.length, 'readings');
      // console.log('useCalendarData: Sample data:', data.slice(0, 3));
      setCalendarData(data);
      setError(null);
    } catch (err) {
      console.error('useCalendarData: Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar data');
    } finally {
      setLoading(false);
    }
  };

  const refreshCalendarData = async () => {
    await fetchCalendarData();
  };

  useEffect(() => {
    // Only fetch data when user is authenticated and auth is not loading
    if (isAuthenticated && !authLoading) {
      fetchCalendarData();
    } else if (!authLoading && !isAuthenticated) {
      // If not authenticated, reset loading state
      setLoading(false);
    }
  }, [isAuthenticated, authLoading]);

  return {
    calendarData,
    loading,
    error,
    refreshCalendarData,
  };
};