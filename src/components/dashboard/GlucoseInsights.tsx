import { useGlucose } from "../../context/GlucoseContext";

export default function GlucoseInsights() {
  const { stats, filteredData, loading, error } = useGlucose();

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded dark:bg-gray-700 mb-4"></div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded dark:bg-gray-700"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-800 dark:bg-red-900/20 sm:p-6">
        <div className="text-center">
          <span className="text-sm text-red-600 dark:text-red-400">
            Error loading glucose insights: {error}
          </span>
        </div>
      </div>
    );
  }

  // Calculate insights from glucose data
  const highReadings = filteredData.filter(r => r.glucoseLevel > 180).length;
  const lowReadings = filteredData.filter(r => r.glucoseLevel < 70).length;
  const normalReadings = filteredData.filter(r => r.glucoseLevel >= 70 && r.glucoseLevel <= 180).length;
  const totalReadings = filteredData.length;

  const highPercentage = totalReadings > 0 ? Math.round((highReadings / totalReadings) * 100) : 0;
  const lowPercentage = totalReadings > 0 ? Math.round((lowReadings / totalReadings) * 100) : 0;
  const normalPercentage = totalReadings > 0 ? Math.round((normalReadings / totalReadings) * 100) : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Glucose Insights
        </h3>
        <p className="mt-1 text-gray-500 text-theme-sm dark:text-gray-400">
          Distribution of glucose readings by range
        </p>
      </div>

      <div className="space-y-5">
        {/* Normal Range */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-theme-sm dark:text-white/90">
                Normal Range
              </p>
              <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                {normalReadings} readings (70-180 mg/dL)
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-[140px] items-center gap-3">
            <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200 dark:bg-gray-800">
              <div 
                className="absolute left-0 top-0 flex h-full items-center justify-center rounded-sm bg-green-500 text-xs font-medium text-white"
                style={{ width: `${normalPercentage}%` }}
              ></div>
            </div>
            <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {normalPercentage}%
            </p>
          </div>
        </div>

        {/* High Range */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-theme-sm dark:text-white/90">
                High Range
              </p>
              <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                {highReadings} readings (&gt;180 mg/dL)
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-[140px] items-center gap-3">
            <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200 dark:bg-gray-800">
              <div 
                className="absolute left-0 top-0 flex h-full items-center justify-center rounded-sm bg-yellow-500 text-xs font-medium text-white"
                style={{ width: `${highPercentage}%` }}
              ></div>
            </div>
            <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {highPercentage}%
            </p>
          </div>
        </div>

        {/* Low Range */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-theme-sm dark:text-white/90">
                Low Range
              </p>
              <span className="block text-gray-500 text-theme-xs dark:text-gray-400">
                {lowReadings} readings (&lt;70 mg/dL)
              </span>
            </div>
          </div>

          <div className="flex w-full max-w-[140px] items-center gap-3">
            <div className="relative block h-2 w-full max-w-[100px] rounded-sm bg-gray-200 dark:bg-gray-800">
              <div 
                className="absolute left-0 top-0 flex h-full items-center justify-center rounded-sm bg-red-500 text-xs font-medium text-white"
                style={{ width: `${lowPercentage}%` }}
              ></div>
            </div>
            <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {lowPercentage}%
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
          <div className="text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total readings analyzed: <span className="font-semibold">{totalReadings}</span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Time in range: <span className="font-semibold text-green-600">{stats.timeInRange}%</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
