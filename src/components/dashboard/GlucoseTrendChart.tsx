import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useGlucose } from "../../context/GlucoseContext";

export default function GlucoseTrendChart() {
  const { filteredData, loading, error } = useGlucose();

  // Prepare data for ApexCharts
  const series = [
    {
      name: 'Blood Glucose (mg/dL)',
      data: filteredData.map(reading => ({
        x: new Date(reading.dateTime).getTime(),
        y: reading.glucoseLevel,
        comment: reading.comment,
      }))
    },
    {
      name: 'Day Average (mg/dL)',
      data: filteredData
        .filter(reading => reading.dayAverage > 0)
        .map(reading => ({
          x: new Date(reading.dateTime).getTime(),
          y: reading.dayAverage
        }))
    }
  ];

  const options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: 'line',
      height: 400,
      toolbar: { show: true },
      zoom: { enabled: true },
      redrawOnWindowResize: true,
      redrawOnParentResize: true
    },
    colors: ["#465fff", "#12b76a"],
    stroke: {
      curve: 'smooth',
      width: 2,
    },
    markers: {
      size: 4
    },
    xaxis: {
      type: 'datetime',
      title: { text: 'Date & Time' },
      labels: { datetimeUTC: false }
    },
    yaxis: {
      title: { text: 'Blood Glucose (mg/dL)' }
    },
    tooltip: {
      x: {
        format: 'MMM d, yyyy h:mm tt'
      },
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const dataPoint = w.globals.initialSeries[seriesIndex].data[dataPointIndex];
        const comment = dataPoint?.comment || '';
        const val = series[seriesIndex][dataPointIndex];
        const seriesName = w.globals.seriesNames[seriesIndex];
        const dateStr = new Date(dataPoint.x).toLocaleString([], { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric', 
          hour: 'numeric', 
          minute: '2-digit', 
          hour12: true 
        });
        
        const commentHtml = comment ? `<div style="padding-top: 5px; font-style: italic;">Comment: ${comment}</div>` : '';

        return `<div class="apexcharts-tooltip-title" style="padding: 6px 10px;">${dateStr}</div>
                <div class="apexcharts-tooltip-series-group" style="padding: 6px 10px;display:block;">
                  ${seriesName}: &nbsp;<strong>${val}</strong>
                  ${commentHtml}
                </div>`;
      }
    },
    legend: {
      position: 'top'
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
          Blood Glucose Trend
        </h3>
      </div>

      <div className="w-full">
        <Chart options={options} series={series} type="line" height={400} />
      </div>
    </div>
  );
}
