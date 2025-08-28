import React from 'react';
import { useDexcom } from '../../context/DexcomContext';
import { DexcomService } from '../../services/dexcom';
import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { formatDistanceToNow } from 'date-fns';

const Dexcom: React.FC = () => {
  const {
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
  } = useDexcom();

  const dexcomService = DexcomService.getInstance();

  const handleConnect = async () => {
    try {
      await connectToDexcom();
    } catch (error) {
      console.error('Failed to connect to Dexcom:', error);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect from Dexcom?')) {
      try {
        await disconnectFromDexcom();
      } catch (error) {
        console.error('Failed to disconnect from Dexcom:', error);
      }
    }
  };

  const handleRefresh = async () => {
    try {
      await refreshData();
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  // const handleTestRawData = async () => {
  //   try {
  //     // console.log('🧪 Testing raw Dexcom API data...');
  //     const result = await dexcomService.testRawData();
  //     // console.log('🧪 Raw test data result:', result);
  //     const resultData = result as { dataLength?: number };
  //     alert(`Test completed! Check console for details. Data length: ${resultData.dataLength || 'unknown'}`);
  //   } catch (error) {
  //     console.error('Failed to test raw data:', error);
  //     alert('Test failed! Check console for details.');
  //   }
  // };

  const timeRangeOptions = [
    { value: 'last_twelve', label: 'Last 12 Hours' },
    // { value: 'last_week', label: 'Last Week' },
    // { value: 'last_month', label: 'Last Month' },
  ];

  const handleTimeRangeChange = (newTimeRange: string) => {
    // console.log(`🕒 Time range button clicked: ${timeRange} -> ${newTimeRange}`);
    setTimeRange(newTimeRange);
    // console.log(`🕒 Time range state should now be: ${newTimeRange}`);
  };

  // Prepare chart data for Dexcom readings
  const chartData = glucoseData.map(reading => ({
    x: new Date(reading.displayTime).getTime(),
    y: reading.value,
    trend: reading.trend,
    trendArrow: dexcomService.getTrendArrow(reading.trend),
  }));

  const chartOptions: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: 'line',
      height: 350,
      toolbar: { show: true },
      zoom: { enabled: true },
      redrawOnWindowResize: true,
      redrawOnParentResize: true
    },
    colors: ["#06b6d4"],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    markers: {
      size: 4,
      strokeWidth: 1,
      strokeColors: '#fff',
      hover: { size: 6 }
    },
    xaxis: {
      type: 'datetime',
      title: { text: 'Time' },
      labels: {
        formatter: function(val: string | number) {
          return new Date(Number(val)).toLocaleTimeString([], { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          });
        }
      }
    },
    yaxis: {
      title: { text: 'Blood Glucose (mg/dL)' },
      min: 50,
      max: 400
    },
    tooltip: {
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const dataPoint = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
        const val = series[seriesIndex][dataPointIndex];
        const timestamp = dataPoint.x;
        const trend = dataPoint.trend;
        const trendArrow = dataPoint.trendArrow;
        
        const dateStr = new Date(timestamp).toLocaleString([], { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        });
        
        return `<div class="apexcharts-tooltip-title" style="padding: 6px 10px;">${dateStr}</div>
                <div class="apexcharts-tooltip-series-group" style="padding: 6px 10px;display:block;">
                  Glucose: &nbsp;<strong style="color: ${dexcomService.getGlucoseColor(val).includes('red') ? '#DC2626' : dexcomService.getGlucoseColor(val).includes('yellow') ? '#D97706' : '#059669'}">${val} mg/dL</strong><br/>
                  Trend: &nbsp;<strong>${trendArrow} ${trend}</strong>
                </div>`;
      }
    },
    grid: {
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } }
    },
    annotations: {
      yaxis: [
        {
          y: 70,
          borderColor: '#EF4444',
          label: {
            text: 'Low (70)',
            style: { color: '#EF4444', background: '#FEE2E2' }
          }
        },
        {
          y: 180,
          borderColor: '#F59E0B', 
          label: {
            text: 'High (180)',
            style: { color: '#F59E0B', background: '#FEF3C7' }
          }
        }
      ]
    }
  };

  if (connectionLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Dexcom Glucose Monitor
        </h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300">
            Checking connection status...
          </span>
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Dexcom Glucose Monitor
        </h1>
        
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Connect to Dexcom G7
            </h2>
            
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Connect your Dexcom G7 to view real-time glucose data, trends, and insights.
              Your data is securely stored and automatically synchronized.
            </p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 rounded">
                {error}
              </div>
            )}
            
            <div className="space-y-3">
              <button
                onClick={handleConnect}
                disabled={connectionLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-8 rounded-lg transition-colors duration-200"
              >
                {connectionLoading ? 'Connecting...' : 'Connect to Dexcom'}
              </button>
              
              <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                You'll be securely redirected to Dexcom to authorize access. 
                Once connected, your glucose data will be available in real-time.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dexcom Glucose Monitor
          </h1>
          
          {/* Connection status indicator */}
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Connected
            </span>
          </div>
          
          {/* Real-time data indicator */}
          <div className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
            <span>Real-time</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors duration-200"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          
          {/* <button
            onClick={handleTestRawData}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white rounded-lg transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>🧪 Test Raw API</span>
          </button> */}
          
          {/* Settings dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                const dropdown = document.getElementById('dexcom-settings-dropdown');
                dropdown?.classList.toggle('hidden');
              }}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            
            <div id="dexcom-settings-dropdown" className="hidden absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
              <div className="py-2">
                <button
                  onClick={handleDisconnect}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Disconnect Dexcom
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900 border border-red-400 text-red-700 dark:text-red-300 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
            <button
              onClick={handleConnect}
              className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Time Range Selector */}
      <div className="mb-6 flex flex-wrap gap-2">
        {timeRangeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => handleTimeRangeChange(option.value)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors duration-200 ${
              timeRange === option.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && glucoseData.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300">
            Loading glucose data...
          </span>
        </div>
      ) : (
        <>
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* Last Reading */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Last Reading
              </h3>
              {stats.lastReading ? (
                <div className="space-y-2">
                  <div className={`text-2xl font-bold ${dexcomService.getGlucoseColor(stats.lastReading.value)}`}>
                    {dexcomService.formatGlucoseValue(stats.lastReading.value)}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">{dexcomService.getTrendArrow(stats.lastReading.trend)}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDistanceToNow(new Date(stats.lastReading.displayTime), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">No data</div>
              )}
            </div>

            {/* Average Glucose */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Average Glucose
              </h3>
              <div className={`text-2xl font-bold ${dexcomService.getGlucoseColor(stats.average)}`}>
                {dexcomService.formatGlucoseValue(stats.average)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {stats.readingsCount} readings
              </div>
            </div>

            {/* Time in Range */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Time in Range
              </h3>
              <div className="text-2xl font-bold text-green-600">
                {stats.timeInRange}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                70-180 mg/dL
              </div>
            </div>

            {/* Estimated HbA1c */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Estimated HbA1c
              </h3>
              <div className="text-2xl font-bold text-purple-600">
                {stats.estimatedHbA1c}%
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Estimated
              </div>
            </div>
          </div>

          {/* Glucose Chart */}
          {chartData.length > 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Glucose Trends ({chartData.length} readings)
                </h2>
                {loading && (
                  <div className="flex items-center text-sm text-gray-500">
                    <div className="animate-spin rounded-full h-3 w-3 border border-blue-600 border-t-transparent mr-2"></div>
                    Updating...
                  </div>
                )}
              </div>
              <div className="w-full">
                <Chart 
                  options={chartOptions} 
                  series={[{ name: 'Glucose', data: chartData }]} 
                  type="line" 
                  height={350} 
                />
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No glucose data available for the selected time range.
              </p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
              >
                Fetch Data
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dexcom;