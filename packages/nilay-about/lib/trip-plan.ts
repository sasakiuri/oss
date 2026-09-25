/**
 * An outing plan for the people left at home: where the hunter is going, with whom, and when they
 * will be back, as a printed card and as an iCalendar event (RFC 5545) whose alarm falls at the
 * time due back. The alarm rings on the device the event is imported into; nothing is sent from here.
 */

export interface TripPlan {
  hunter: string;
  companions: string;
  area: string;
  route: string;
  departAt: string;
  returnBy: string;
  vehicle: string;
  radio: string;
  gear: string;
  contactName: string;
  contactPhone: string;
  /** What to do if the hunter is not back: who to call first, and so on. */
  ifLate: string;
  notes: string;
}

export const TRIP_TEXT_MAX = 300;
export const TRIP_NOTE_MAX = 1500;

const localPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A `datetime-local` value as the instant it means in this device's time zone, or null. */
export function localToDate(value: string): Date | null {
  const match = localPattern.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export type TripProblem = 'depart' | 'return' | 'order';

export function tripProblems(plan: Pick<TripPlan, 'departAt' | 'returnBy'>): TripProblem[] {
  const depart = localToDate(plan.departAt);
  const back = localToDate(plan.returnBy);
  const problems: TripProblem[] = [];
  if (!depart) problems.push('depart');
  if (!back) problems.push('return');
  if (depart && back && back <= depart) problems.push('order');
  return problems;
}

/** TEXT escaping of RFC 5545 §3.3.11. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (§3.1), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += character;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utcStamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export interface IcsLabels {
  summary: string;
  alarm: string;
  lines: [label: string, value: string][];
}

/** The plan as one VEVENT from departure to the time due back, with an alarm at the time due back. */
export function buildIcs(plan: TripPlan, labels: IcsLabels, uid: string, now: Date): string | null {
  const depart = localToDate(plan.departAt);
  const back = localToDate(plan.returnBy);
  if (!depart || !back || back <= depart) return null;
  const description = labels.lines
    .filter(([, value]) => value.trim() !== '')
    .map(([label, value]) => `${label}: ${value.trim()}`)
    .join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nilay//Labs trip plan//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(depart)}`,
    `DTEND:${utcStamp(back)}`,
    `SUMMARY:${escapeText(labels.summary)}`,
    ...(plan.area.trim() ? [`LOCATION:${escapeText(plan.area.trim())}`] : []),
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(labels.alarm)}`,
    'TRIGGER;RELATED=END:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
