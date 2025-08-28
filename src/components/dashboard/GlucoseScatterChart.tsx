import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useGlucose } from "../../context/GlucoseContext";

export default function GlucoseScatterChart() {
  const { glucoseData, loading, error } = useGlucose();

  // Filter to last 90 days only
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const filteredData = glucoseData.filter(reading => {
    const readingDate = new Date(reading.dateTime);
    return readingDate >= ninetyDaysAgo;
  });

  // Group data by month/year and normalize to day of month for layering
  const monthlyData: { [key: string]: Array<{x: number, y: number, comment: string, originalDate: string}> } = {};
  
  filteredData.forEach(reading => {
    const date = new Date(reading.dateTime);
    const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
    const dayOfMonth = date.getDate();
    const hourOfDay = date.getHours() + (date.getMinutes() / 60);
    
    if (!monthlyData[monthYear]) {
      monthlyData[monthYear] = [];
    }
    
    monthlyData[monthYear].push({
      x: dayOfMonth + (hourOfDay / 24), // Day of month with hour as decimal
      y: reading.glucoseLevel,
      comment: reading.comment,
      originalDate: reading.dateTime
    });
  });

  // Create series for each month
  const series = Object.entries(monthlyData).map(([monthYear, data]) => ({
    name: monthYear,
    data: data
  }));

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: 'scatter',
      height: 350,
      toolbar: { show: true },
      zoom: { enabled: true },
      redrawOnWindowResize: true,
      redrawOnParentResize: true
    },
    colors: ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#f97316", "#84cc16", "#ec4899", "#6366f1"],
    markers: {
      size: 6,
      strokeWidth: 1,
      strokeColors: '#fff',
      hover: {
        size: 8
      }
    },
    xaxis: {
      type: 'numeric',
      title: { text: 'Day of Month' },
      labels: {
        formatter: function(val: string | number) {
          return Math.floor(Number(val)).toString();
        }
      },
      min: 1,
      max: 32
    },
    yaxis: {
      title: { text: 'Blood Glucose (mg/dL)' },
      min: 50,
      max: 160
    },
    tooltip: {
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const dataPoint = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
        const comment = dataPoint?.comment || '';
        const val = series[seriesIndex][dataPointIndex];
        const seriesName = w.globals.seriesNames[seriesIndex];
        const dayOfMonth = Math.floor(dataPoint.x);
        const originalDate = dataPoint?.originalDate;
        
        let dateStr = `Day ${dayOfMonth}`;
        if (originalDate) {
          dateStr = new Date(originalDate).toLocaleString([], { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
          });
        }
        
        const commentHtml = comment ? `<div style="padding-top: 5px; font-style: italic;">Comment: ${comment}</div>` : '';

        return `<div class="apexcharts-tooltip-title" style="padding: 6px 10px;">${seriesName} - ${dateStr}</div>
                <div class="apexcharts-tooltip-series-group" style="padding: 6px 10px;display:block;">
                  Glucose Level: &nbsp;<strong>${val} mg/dL</strong>
                  ${commentHtml}
                </div>`;
      }
    },
    grid: {
      xaxis: {
        lines: {
          show: true
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    legend: {
      position: 'top',
      horizontalAlign: 'center',
      floating: false,
      offsetY: 0,
      itemMargin: {
        horizontal: 10,
        vertical: 5
      }
    }
  };

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded dark:bg-gray-700 mb-4 w-48"></div>
          <div className="h-80 bg-gray-200 rounded dark:bg-gray-700"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 px-5 pt-5 dark:border-red-800 dark:bg-red-900/20 sm:px-6 sm:pt-6">
        <div className="text-center py-10">
          <span className="text-sm text-red-600 dark:text-red-400">
            Error loading chart data: {error}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Monthly Glucose Patterns Overlay
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Last 90 days layered by day of month to show patterns
        </p>
      </div>

      <div className="w-full">
        <Chart options={options} series={series} type="scatter" height={350} />
      </div>
    </div>
  );
}