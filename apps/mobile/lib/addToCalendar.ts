import { Linking } from 'react-native';
import { calendarUrl } from './calendarLink';

type Appointment = { serviceName: string; vehicleName?: string; scheduledAt?: string; location?: string };

/**
 * Opens the phone's own "new event" editor prefilled (no calendar permission needed). If the native
 * editor is unavailable, falls back to the web link.
 */
export async function addToCalendar(b: Appointment, durationMinutes = 60): Promise<void> {
  const start = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (!start || Number.isNaN(start.getTime())) return;
  try {
    const Calendar = await import('expo-calendar');
    await Calendar.createEventInCalendarAsync({
      title: `SoFlo Suds: ${b.serviceName}`,
      startDate: start,
      endDate: new Date(start.getTime() + durationMinutes * 60_000),
      location: b.location,
      notes: [b.vehicleName, 'Booked with SoFlo Suds'].filter(Boolean).join('\n'),
    });
  } catch {
    const url = calendarUrl(b, durationMinutes);
    if (url) await Linking.openURL(url);
  }
}
