import { describe, expect, it } from 'vitest';

import { buildIcs, escapeIcsText, foldIcsLine } from '@/lib/ics';

const now = new Date('2026-09-24T03:04:05.678Z');

describe('buildIcs', () => {
  it('writes all-day events with an exclusive end day and reminders', () => {
    const text = buildIcs(
      [
        {
          uid: 'permit-renewal@nilay.jp',
          start: '2028-04-10',
          end: '2028-05-10',
          summary: '所持許可の更新申請期間',
          description: '銃刀法施行規則 第34条',
          alarmDaysBefore: [7, 0],
        },
      ],
      now,
      'Labs',
    );
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(text).toContain('DTSTART;VALUE=DATE:20280410\r\n');
    expect(text).toContain('DTEND;VALUE=DATE:20280511\r\n');
    expect(text).toContain('DTSTAMP:20260924T030405Z\r\n');
    expect(text).toContain('TRIGGER:-P7D\r\n');
    expect(text).toContain('TRIGGER:PT0S\r\n');
  });

  it('ends a one-day event on the next day', () => {
    const text = buildIcs([{ uid: 'a', start: '2026-12-31', summary: 'x' }], now, 'Labs');
    expect(text).toContain('DTEND;VALUE=DATE:20270101\r\n');
  });

  it('rejects an end before the start', () => {
    expect(() => buildIcs([{ uid: 'a', start: '2026-12-31', end: '2026-12-30', summary: 'x' }], now, 'L')).toThrow();
  });

  it('rejects a day the calendar does not have (RFC 5545 3.3.4)', () => {
    expect(() => buildIcs([{ uid: 'a', start: '2026-02-30', summary: 'x' }], now, 'L')).toThrow();
    expect(() => buildIcs([{ uid: 'a', start: '2026-02-01', end: '2026-02-29', summary: 'x' }], now, 'L')).toThrow();
    expect(buildIcs([{ uid: 'a', start: '2028-02-29', summary: 'x' }], now, 'L')).toContain(
      'DTEND;VALUE=DATE:20280301\r\n',
    );
  });

  it('writes a web address as a URI and refuses one that would break the line (RFC 5545 3.1, 3.3.13)', () => {
    const event = { uid: 'a', start: '2026-12-01', summary: 'x' };
    expect(buildIcs([{ ...event, url: 'https://laws.e-gov.go.jp/law/333AC0000000006' }], now, 'L')).toContain(
      'URL:https://laws.e-gov.go.jp/law/333AC0000000006\r\n',
    );
    expect(() => buildIcs([{ ...event, url: 'https://x.example/\r\nSUMMARY:偽' }], now, 'L')).toThrow();
    expect(() => buildIcs([{ ...event, url: 'https://x.example/a b' }], now, 'L')).toThrow();
    expect(() => buildIcs([{ ...event, url: 'javascript:alert(1)' }], now, 'L')).toThrow();
    expect(() => buildIcs([{ ...event, url: 'not a url' }], now, 'L')).toThrow();
    // A non-ASCII path is written percent-encoded, as a URI requires.
    expect(buildIcs([{ ...event, url: 'https://x.example/狩猟' }], now, 'L')).toContain(
      'URL:https://x.example/%E7%8B%A9%E7%8C%9F\r\n',
    );
  });
});

describe('text values', () => {
  it('escapes the characters RFC 5545 reserves', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
  });

  it('folds at 75 octets without splitting a character', () => {
    const line = `SUMMARY:${'あ'.repeat(40)}`;
    const folded = foldIcsLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split('\r\n')) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});
