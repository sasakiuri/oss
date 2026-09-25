/**
 * iCalendar (RFC 5545) files of all-day events, for the tools that hand a reader dates to keep.
 *
 * Labs has no server to send reminders from, so a file the reader imports into their own calendar
 * is how a deadline reaches them later. Every event is an all-day event on Japanese calendar days,
 * written as DATE values, which carry no time zone and so never move by a day.
 */

import { addDays, parseIsoDate } from './calendar-days';

export interface IcsEvent {
  /** Stable across exports, so importing the file again updates the event instead of adding a copy. */
  uid: string;
  /** The first day, as an ISO date. */
  start: string;
  /** The last day, included, as an ISO date. Left out for a single day. */
  end?: string;
  summary: string;
  description?: string;
  url?: string;
  /** Reminders, in whole days before the first day. Some calendars ignore reminders in an imported file. */
  alarmDaysBefore?: readonly number[];
}

/** A DATE value, for a day the calendar has (RFC 5545 3.3.4). */
function dateValue(iso: string): string {
  if (!parseIsoDate(iso)) throw new Error(`Not a calendar day: ${iso}`);
  return iso.replace(/-/g, '');
}

/**
 * A URI value (RFC 5545 3.3.13, RFC 3986) for an http or https address. Whitespace and control
 * characters are refused rather than dropped, since a line break would start a new content line; the
 * address is written in its serialised form, with anything outside ASCII percent-encoded.
 */
export function icsUri(value: string): string {
  if (/[\s\u0000-\u001f\u007f]/.test(value)) throw new Error(`Not a URI: ${value}`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Not a URI: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Not a web address: ${value}`);
  return url.href;
}

/** TEXT values escape the backslash, the semicolon, the comma and the line break (RFC 5545 3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

/**
 * Lines longer than 75 octets are folded with CRLF and a space (RFC 5545 3.1). The count is in
 * UTF-8 bytes, and a character is never split, so Japanese text survives the fold.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  // A continuation line starts with the space that marks it, which counts towards its 75 octets.
  let limit = 75;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function timestamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildIcs(events: readonly IcsEvent[], now: Date, calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nilay//Labs//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];
  for (const event of events) {
    const end = event.end ?? event.start;
    const dtstart = dateValue(event.start);
    const dtend = dateValue(end);
    if (dtend < dtstart) throw new Error(`An event cannot end before it starts: ${event.uid}`);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${timestamp(now)}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      // DTEND of an all-day event is the day after its last day.
      `DTEND;VALUE=DATE:${dateValue(addDays(end, 1))}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.url) lines.push(`URL:${icsUri(event.url)}`);
    lines.push('TRANSP:TRANSPARENT');
    for (const days of new Set(event.alarmDaysBefore ?? [])) {
      if (!Number.isInteger(days) || days < 0) throw new Error(`Not a whole number of days: ${days}`);
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeIcsText(event.summary)}`,
        `TRIGGER:${days === 0 ? 'PT0S' : `-P${days}D`}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

/** Hands the file to the browser to save. Browser only. */
export function downloadIcs(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
