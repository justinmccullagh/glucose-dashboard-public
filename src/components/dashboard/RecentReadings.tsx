import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../ui/table";
import Badge from "../ui/badge/Badge";
import { useGlucose } from "../../context/GlucoseContext";
import { format } from "date-fns";

// Helper function to get glucose level status
const getGlucoseStatus = (level: number): { status: string; variant: "success" | "warning" | "danger" } => {
  if (level < 70) return { status: "Low", variant: "danger" };
  if (level > 180) return { status: "High", variant: "warning" };
  return { status: "Normal", variant: "success" };
};

export default function RecentReadings() {
  const { filteredData, loading, error } = useGlucose();

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded dark:bg-gray-700 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded dark:bg-gray-700"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 px-4 pb-3 pt-4 dark:border-red-800 dark:bg-red-900/20 sm:px-6">
        <div className="text-center">
          <span className="text-sm text-red-600 dark:text-red-400">
            Error loading glucose data: {error}
          </span>
        </div>
      </div>
    );
  }

  // Get the most recent 10 readings
  const recentReadings = filteredData.slice(-10).reverse();

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Recent Glucose Readings
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Showing last {recentReadings.length} readings
          </span>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <Table>
          {/* Table Header */}
          <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
            <TableRow>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Date & Time
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Glucose Level
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Comment
              </TableCell>
              <TableCell
                isHeader
                className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                Status
              </TableCell>
            </TableRow>
          </TableHeader>

          {/* Table Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {recentReadings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-gray-500 dark:text-gray-400">
                  No glucose readings available
                </TableCell>
              </TableRow>
            ) : (
              recentReadings.map((reading, index) => {
                const glucoseStatus = getGlucoseStatus(reading.glucoseLevel);
                const readingDate = new Date(reading.dateTime);
                
                return (
                  <TableRow key={`${reading.dateTime}-${index}`} className="">
                    <TableCell className="py-3">
                      <div>
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
                          {format(readingDate, 'MMM dd, yyyy')}
                        </p>
                        <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                          {format(readingDate, 'h:mm a')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-800 dark:text-white">
                          {reading.glucoseLevel}
                        </span>
                        <span className="text-gray-500 text-theme-xs dark:text-gray-400">
                          mg/dL
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {reading.comment || '--'}
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      <Badge
                        size="sm"
                        color={glucoseStatus.variant === "success" ? "success" : glucoseStatus.variant === "warning" ? "warning" : "error"}
                      >
                        {glucoseStatus.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}