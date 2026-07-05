// services/calendarContext.ts
// Gathers the user's upcoming calendar events (next 24 h) as compact context
// for Kwame, so "get me to my meeting" resolves to a real place and time.
// Everything is permission-gated and failure-tolerant: any error returns [],
// and the permission is only requested once per app session.
import * as Calendar from 'expo-calendar';
import { CalendarEventContext } from './ai';

let permissionAskedThisSession = false;

function formatStart(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return sameDay ? `Today ${hm}` : `Tomorrow ${hm}`;
}

export async function getUpcomingCalendarEvents(maxEvents = 5): Promise<CalendarEventContext[]> {
  try {
    let { status } = await Calendar.getCalendarPermissionsAsync();

    if (status !== 'granted') {
      if (permissionAskedThisSession) return [];
      permissionAskedThisSession = true;
      ({ status } = await Calendar.requestCalendarPermissionsAsync());
      if (status !== 'granted') return [];
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!calendars.length) return [];

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const events = await Calendar.getEventsAsync(calendars.map((c) => c.id), now, in24h);

    return events
      .filter((e) => !e.allDay)
      .sort((a, b) => new Date(a.startDate as any).getTime() - new Date(b.startDate as any).getTime())
      .slice(0, maxEvents)
      .map((e) => ({
        title: e.title || 'Untitled event',
        start: formatStart(new Date(e.startDate as any)),
        ...(e.location ? { location: e.location } : {}),
      }));
  } catch {
    return [];
  }
}
