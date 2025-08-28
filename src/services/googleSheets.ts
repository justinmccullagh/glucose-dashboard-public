export interface GlucoseReading {
  dateTime: string;
  glucoseLevel: number;
  comment: string;
  dayAverage: number;
}

export interface GlucoseStats {
  avg: string;
  min: number;
  max: number;
  count: number;
  timeInRange: number;
  estimatedHbA1c: string;
}

export class GoogleSheetsService {
  private static instance: GoogleSheetsService;
  private readonly SPREADSHEET_ID: string;
  private readonly API_KEY: string;
  private readonly RANGE = '2025_all_data!A:D';

  private constructor() {
    this.SPREADSHEET_ID = import.meta.env.VITE_SPREADSHEET_ID || '';
    this.API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
  }

  public static getInstance(): GoogleSheetsService {
    if (!GoogleSheetsService.instance) {
      GoogleSheetsService.instance = new GoogleSheetsService();
    }
    return GoogleSheetsService.instance;
  }

  public isConfigured(): boolean {
    return !!(this.SPREADSHEET_ID && this.API_KEY);
  }

  public async fetchGlucoseData(): Promise<GlucoseReading[]> {
    if (!this.isConfigured()) {
      throw new Error('Missing Google Sheets configuration. Please check your environment variables.');
    }

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}/values/${this.RANGE}?key=${this.API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment before refreshing.');
        }
        if (response.status === 403) {
          throw new Error('API key invalid or quota exceeded. Please check your Google Sheets API configuration.');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const rows = data.values || [];
      
      // Transform data for the frontend
      const transformedData = rows
        .filter((row: string[]) => row.length >= 2 && row[0] && row[1]) // Filter out empty rows
        .map((row: string[]) => ({
          dateTime: row[0],
          glucoseLevel: parseFloat(row[1]) || 0,
          comment: (row[2]) || "",
          dayAverage: parseFloat(row[3]) || 0
        }))
        .filter((item: GlucoseReading) => !isNaN(item.glucoseLevel) && item.glucoseLevel > 0); // Remove invalid glucose readings
      
      return transformedData;
    } catch (err) {
      console.error('Error fetching glucose data:', err);
      throw new Error(`Failed to fetch data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  public calculateStats(data: GlucoseReading[]): GlucoseStats {
    if (data.length === 0) {
      return { 
        avg: '0', 
        min: 0, 
        max: 0, 
        count: 0, 
        timeInRange: 0, 
        estimatedHbA1c: '0.0' 
      };
    }
    
    const glucoseValues = data.map(item => item.glucoseLevel).filter(val => val > 0);
    if (glucoseValues.length === 0) {
      return { 
        avg: '0', 
        min: 0, 
        max: 0, 
        count: 0, 
        timeInRange: 0, 
        estimatedHbA1c: '0.0' 
      };
    }
    
    const avg = glucoseValues.reduce((sum, val) => sum + val, 0) / glucoseValues.length;
    const min = Math.min(...glucoseValues);
    const max = Math.max(...glucoseValues);
    
    // Calculate Time in Range (70-180 mg/dL)
    const inRangeCount = glucoseValues.filter(val => val >= 70 && val <= 180).length;
    const timeInRange = Math.round((inRangeCount / glucoseValues.length) * 100);
    
    // Estimate HbA1c using the formula: HbA1c = (avg + 46.7) / 28.7
    const estimatedHbA1c = ((avg + 46.7) / 28.7).toFixed(1);
    
    return { 
      avg: avg.toFixed(1), 
      min, 
      max, 
      count: glucoseValues.length,
      timeInRange,
      estimatedHbA1c
    };
  }

  public filterDataByTimeRange(data: GlucoseReading[], timeRange: string): GlucoseReading[] {
    if (timeRange === 'all' || data.length === 0) {
      return data;
    }
    
    if (timeRange === 'last_twelve') {
      // Sort data by dateTime in descending order and take the last 12 entries
      const sortedData = [...data].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
      return sortedData.slice(0, 12).reverse(); // Reverse to show chronological order
    }
    
    const now = new Date();
    let cutoffDate: Date;
    
    if (timeRange === 'week') {
      cutoffDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    } else if (timeRange === 'month') {
      cutoffDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    } else if (timeRange === 'three_months') {
      cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    } else {
      return data;
    }
    
    return data.filter(item => {
      const itemDate = new Date(item.dateTime);
      return itemDate >= cutoffDate;
    });
  }
}