/** A web "add event" link (Google Calendar template). Works on Android and iOS without a calendar permission. */
export function calendarUrl(b: { serviceName: string; vehicleName?: string; scheduledAt?: string; location?: string }, durationMinutes = 60): string | null {
  const start = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `SoFlo Suds: ${b.serviceName}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: [b.vehicleName, 'Booked with SoFlo Suds'].filter(Boolean).join('\n'),
    ...(b.location ? { location: b.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
