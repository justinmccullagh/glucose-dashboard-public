import { useState, useRef, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { EventInput, EventClickArg } from "@fullcalendar/core";
import { Modal } from "../components/ui/modal";
import { useModal } from "../hooks/useModal";
import PageMeta from "../components/common/PageMeta";
import { GlucoseReading } from "../services/googleSheets";
import { useCalendarData } from "../hooks/useCalendarData";
import { format, parseISO, isValid } from "date-fns";

interface GlucoseEvent extends EventInput {
  extendedProps: {
    glucoseLevel: number;
    comment?: string;
    dayAverage?: number;
    readingsCount: number;
    timeRange: string;
    readings: GlucoseReading[]; // Store all individual readings for the day
  };
}

const Calendar: React.FC = () => {
  const [selectedEvent, setSelectedEvent] = useState<GlucoseEvent | null>(null);
  const [events, setEvents] = useState<GlucoseEvent[]>([]);
  const calendarRef = useRef<FullCalendar>(null);
  const { isOpen, openModal, closeModal } = useModal();
  const { calendarData: glucoseData, loading, error } = useCalendarData();

  useEffect(() => {
    // console.log('=== CALENDAR DEBUG ===');
    // console.log('glucoseData length:', glucoseData?.length || 0);
    // console.log('loading:', loading);
    // console.log('error:', error);
    // console.log('Sample data:', glucoseData?.slice(0, 3));
    
    if (!glucoseData || glucoseData.length === 0) {
      // console.log('No glucose data available for calendar');
      return;
    }
    
    // console.log('Processing data:', glucoseData.length, 'readings');

    // Group glucose readings by date
    const eventsByDate = new Map<string, {
      readings: GlucoseReading[];
      comments: string[];
      dayAverage?: number;
    }>();

    glucoseData.forEach((reading: GlucoseReading /* , index: number */) => {
      // if (index < 5) console.log(`Processing reading ${index}:`, reading);
      
      if (!reading.dateTime) {
        // if (index < 5) console.log('Skipping reading without dateTime:', reading);
        return;
      }
      
      let date: Date;
      
      // Handle different date formats
      if (typeof reading.dateTime === 'string') {
        // Try parsing as ISO string first
        date = parseISO(reading.dateTime);
        
        // If that fails, try parsing as regular date
        if (!isValid(date)) {
          date = new Date(reading.dateTime);
        }
      } else {
        date = reading.dateTime;
      }

      if (!isValid(date)) {
        // if (index < 5) console.log('Invalid date for reading:', reading.dateTime);
        return;
      }
      
      // if (index < 5) console.log('Parsed date:', date.toISOString(), 'from:', reading.dateTime);

      const dateKey = format(date, 'yyyy-MM-dd');
      
      if (!eventsByDate.has(dateKey)) {
        eventsByDate.set(dateKey, { readings: [], comments: [] });
      }
      
      const dayData = eventsByDate.get(dateKey)!;
      dayData.readings.push(reading);
      
      if (reading.comment && reading.comment.trim()) {
        dayData.comments.push(reading.comment.trim());
      }
      
      if (reading.dayAverage && !dayData.dayAverage) {
        dayData.dayAverage = reading.dayAverage;
      }
    });

    // Convert to calendar events
    const calendarEvents: GlucoseEvent[] = Array.from(eventsByDate.entries()).map(([dateKey, dayData]) => {
      const avgGlucose = dayData.dayAverage || 
        dayData.readings.reduce((sum: number, r: GlucoseReading) => sum + r.glucoseLevel, 0) / dayData.readings.length;
      
      const readingsCount = dayData.readings.length;
      const highReadings = dayData.readings.filter((r: GlucoseReading) => r.glucoseLevel > 180).length;
      const lowReadings = dayData.readings.filter((r: GlucoseReading) => r.glucoseLevel < 70).length;
      
      // Determine event color based on glucose levels
      let eventColor = 'success'; // green for normal
      let timeRange = 'Normal';
      
      if (lowReadings > 0) {
        eventColor = 'danger'; // red for any low readings
        timeRange = 'Low Detected';
      } else if (highReadings > readingsCount * 0.3) { // >30% high readings
        eventColor = 'warning'; // yellow for high readings
        timeRange = 'High Readings';
      } else if (avgGlucose < 70) {
        eventColor = 'danger';
        timeRange = 'Low Average';
      } else if (avgGlucose > 180) {
        eventColor = 'warning';
        timeRange = 'High Average';
      }

      const title = `${Math.round(avgGlucose)} mg/dL (${readingsCount} readings)`;
      
      return {
        id: dateKey,
        title,
        start: dateKey,
        allDay: true,
        backgroundColor: getEventColor(eventColor),
        borderColor: getEventColor(eventColor),
        extendedProps: {
          glucoseLevel: Math.round(avgGlucose),
          comment: dayData.comments.join('; '),
          dayAverage: dayData.dayAverage,
          readingsCount,
          timeRange,
          readings: dayData.readings.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()), // Sort readings by time
        },
      };
    });

    // console.log('Final grouped events by date:', eventsByDate.size);
    // console.log('Sample grouped data:', Array.from(eventsByDate.entries()).slice(0, 3));
    // console.log('Created calendar events:', calendarEvents.length);
    // console.log('Sample calendar events:', calendarEvents.slice(0, 3));
    
    setEvents(calendarEvents);
  }, [glucoseData]);

  const getEventColor = (type: string): string => {
    switch (type) {
      case 'danger': return '#dc2626'; // red
      case 'warning': return '#d97706'; // orange
      case 'success': return '#16a34a'; // green
      case 'primary': return '#2563eb'; // blue
      default: return '#6b7280'; // gray
    }
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    const event = clickInfo.event;
    setSelectedEvent({
      id: event.id,
      title: event.title,
      start: event.start?.toISOString() || event.startStr,
      extendedProps: event.extendedProps as GlucoseEvent['extendedProps'],
    });
    openModal();
  };

  const closeModalAndReset = () => {
    setSelectedEvent(null);
    closeModal();
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded dark:bg-gray-700 mb-4"></div>
          <div className="h-96 bg-gray-200 rounded dark:bg-gray-700"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            Error Loading Calendar
          </h3>
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <p className="text-sm text-red-500 dark:text-red-300">
            Please check your Google Sheets configuration:
          </p>
          <ul className="text-sm text-red-500 dark:text-red-300 mt-2 space-y-1">
            <li>• VITE_GOOGLE_API_KEY environment variable</li>
            <li>• VITE_SPREADSHEET_ID environment variable</li>
            <li>• Google Sheets API is enabled</li>
            <li>• Sheet name: '2025_all_data'</li>
          </ul>
        </div>
      </div>
    );
  }

  if (!loading && (!glucoseData || glucoseData.length === 0)) {
    return (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 p-6">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-2">
            No Glucose Data Available
          </h3>
          <p className="text-blue-600 dark:text-blue-400 mb-4">
            No glucose readings found in your Google Sheets.
          </p>
          <p className="text-sm text-blue-500 dark:text-blue-300">
            Make sure your Google Sheets contains data in the '2025_all_data' sheet with:
          </p>
          <ul className="text-sm text-blue-500 dark:text-blue-300 mt-2 space-y-1">
            <li>• Column A: Date/Time</li>
            <li>• Column B: Glucose Level (mg/dL)</li>
            <li>• Column C: Comment (optional)</li>
            <li>• Column D: Day Average (optional)</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title="Glucose Calendar | Glucose Dashboard"
        description="View your glucose readings and daily patterns in calendar format"
      />
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
            Glucose Calendar
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Daily glucose averages and reading counts from your Google Sheets data
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
            Debug: {glucoseData?.length || 0} total readings loaded, {events.length} calendar events created
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-600"></div>
              <span className="text-gray-600 dark:text-gray-400">Normal Range</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-600"></div>
              <span className="text-gray-600 dark:text-gray-400">High Readings</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-600"></div>
              <span className="text-gray-600 dark:text-gray-400">Low Detected</span>
            </div>
          </div>
        </div>
        <div className="custom-calendar">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next",
              center: "title",
              right: "dayGridMonth,timeGridWeek",
            }}
            events={events}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            height="auto"
            dayMaxEvents={3}
            moreLinkClick="popover"
          />
        </div>

        <Modal
          isOpen={isOpen}
          onClose={closeModalAndReset}
          className="max-w-[800px] p-6 lg:p-8 max-h-[90vh] overflow-y-auto"
        >
          {selectedEvent && (
            <div className="flex flex-col">
              <div>
                <h5 className="mb-2 font-semibold text-gray-800 text-xl dark:text-white/90">
                  {format(parseISO(selectedEvent.id as string), 'MMMM d, yyyy')}
                </h5>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Daily glucose summary and all readings
                </p>
              </div>
              
              <div className="mt-6 space-y-6">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Average Glucose
                    </h6>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">
                      {selectedEvent.extendedProps.glucoseLevel} mg/dL
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Total Readings
                    </h6>
                    <p className="text-2xl font-bold text-gray-800 dark:text-white">
                      {selectedEvent.extendedProps.readingsCount}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Status
                  </h6>
                  <p className={`text-sm font-medium ${
                    selectedEvent.extendedProps.timeRange === 'Normal' ? 'text-green-600' :
                    selectedEvent.extendedProps.timeRange.includes('Low') ? 'text-red-600' :
                    'text-orange-600'
                  }`}>
                    {selectedEvent.extendedProps.timeRange}
                  </p>
                </div>

                {selectedEvent.extendedProps.dayAverage && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <h6 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Day Average (from sheet)
                    </h6>
                    <p className="text-lg font-semibold text-gray-800 dark:text-white">
                      {Math.round(selectedEvent.extendedProps.dayAverage)} mg/dL
                    </p>
                  </div>
                )}

                {/* All Individual Readings */}
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h6 className="text-lg font-semibold text-gray-800 dark:text-white">
                      All Readings ({selectedEvent.extendedProps.readingsCount})
                    </h6>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Time
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Glucose
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Comment
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {selectedEvent.extendedProps.readings.map((reading, index) => {
                          const readingTime = new Date(reading.dateTime);
                          const glucoseValue = reading.glucoseLevel;
                          let glucoseColor = 'text-green-600 dark:text-green-400';
                          
                          if (glucoseValue < 70) {
                            glucoseColor = 'text-red-600 dark:text-red-400';
                          } else if (glucoseValue > 180) {
                            glucoseColor = 'text-orange-600 dark:text-orange-400';
                          }
                          
                          return (
                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                              <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                {format(readingTime, 'h:mm a')}
                              </td>
                              <td className={`px-4 py-2 text-sm font-semibold ${glucoseColor}`}>
                                {glucoseValue} mg/dL
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                                {reading.comment || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedEvent.extendedProps.comment && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <h6 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
                      All Comments
                    </h6>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      {selectedEvent.extendedProps.comment}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={closeModalAndReset}
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
};

const renderEventContent = (eventInfo: any) => {
  return (
    <div className="fc-event-main p-1">
      <div className="fc-event-title text-xs font-medium truncate">
        {eventInfo.event.title}
      </div>
    </div>
  );
};

export default Calendar;