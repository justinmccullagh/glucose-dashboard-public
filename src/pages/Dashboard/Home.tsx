import GlucoseMetrics from "../../components/dashboard/GlucoseMetrics";
import GlucoseTrendChart from "../../components/dashboard/GlucoseTrendChart";
import GlucoseScatterChart from "../../components/dashboard/GlucoseScatterChart";
// import GlucoseTargets from "../../components/dashboard/GlucoseTargets";
import RecentReadings from "../../components/dashboard/RecentReadings";
import GlucoseInsights from "../../components/dashboard/GlucoseInsights";
import PageMeta from "../../components/common/PageMeta";
import { useGlucose } from "../../context/GlucoseContext";

export default function Home() {
  const { timeRange, setTimeRange } = useGlucose();
  return (
    <>
      <PageMeta
        title="Blood Glucose Dashboard"
        description="This is a dashboard that pulls in blood glucose numbers recorded in a google sheet and displays them nicely"
      />
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        
        <div className="col-span-12 space-y-6 xl:col-span-12">
          <GlucoseMetrics />

          <div className="col-span-12 space-y-6 xl:col-span-12" >
            <div className="flex justify-center">
              <div className="inline-flex p-1" role="group">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-md ${timeRange === 'last_twelve'
                      ? 'dark:hover:text-white shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : ' text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setTimeRange('last_twelve')}
                >
                  Last 12 Readings
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-md ${timeRange === 'week'
                      ? 'dark:hover:text-white shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : ' text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setTimeRange('week')}
                >
                  Last Week
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-md ${timeRange === 'month'
                      ? 'dark:hover:text-white shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : ' text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setTimeRange('month')}
                >
                  Last Month
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium rounded-md ${timeRange === 'three_months'
                      ? 'dark:hover:text-white shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800'
                      : ' text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  onClick={() => setTimeRange('three_months')}
                >
                  Last 3 Months
                </button>
              </div>
            </div>
          </div>
          <GlucoseTrendChart />
          <GlucoseScatterChart />
        </div>

        {/* <div className="col-span-12 xl:col-span-5">
          <GlucoseTargets />
        </div> */}

        <div className="col-span-12 xl:col-span-7">
          <RecentReadings />
        </div>
        
        <div className="col-span-12 xl:col-span-5">
          <GlucoseInsights />
        </div>
      </div>
    </>
  );
}
