import { describe, expect, it } from 'vitest';

import { trapCheckSchema, workSessionSchema, type Trap, type TrapCheck } from '@/lib/schemas/trap-check-log';
import {
  buildDailyReport,
  buildDailyReportCsv,
  buildTrapIcs,
  foldIcsLine,
  formatWorkMinutes,
  roundCoordinate,
  sessionMinutes,
  totalStats,
  trapStats,
} from '@/lib/trap-check-report';

// Local wall-clock times, read the same way the page reads them, so the tests hold in any time zone.
const at = (value: string) => new Date(value).getTime();

const trap = (overrides: Partial<Trap> = {}): Trap => ({
  id: 't1',
  name: '沢 1 号',
  kind: 'kukuri',
  installedAt: '2026-09-01T06:00',
  location: '',
  latitude: null,
  longitude: null,
  removedAt: null,
  checks: [],
  ...overrides,
});

const round = (id: string, when: string, result: TrapCheck['result'], extra: Partial<TrapCheck> = {}): TrapCheck => ({
  id,
  at: when,
  result,
  note: '',
  ...extra,
});

describe('the saved shapes', () => {
  it('reads a round saved before heads and positions were recorded', () => {
    expect(trapCheckSchema.safeParse({ id: 'c', at: '2026-09-02T06:00', result: 'caught', note: '' }).success).toBe(
      true,
    );
  });

  it('refuses a count on a round without an animal, and half a position', () => {
    expect(trapCheckSchema.safeParse(round('c', '2026-09-02T06:00', 'nothing', { heads: 1 })).success).toBe(false);
    expect(trapCheckSchema.safeParse(round('c', '2026-09-02T06:00', 'nothing', { latitude: 35 })).success).toBe(false);
    expect(
      trapCheckSchema.safeParse(round('c', '2026-09-02T06:00', 'caught', { heads: 2, latitude: 35, longitude: 139 }))
        .success,
    ).toBe(true);
  });

  it('refuses work that ends before it starts', () => {
    const session = { id: 'w', start: '2026-09-02T08:00', end: '2026-09-02T07:59', note: '' };
    expect(workSessionSchema.safeParse(session).success).toBe(false);
    expect(workSessionSchema.safeParse({ ...session, end: null }).success).toBe(true);
  });
});

describe('figures for each trap', () => {
  it('counts trap-days from setting to removal and the catch per 100 trap-days', () => {
    const stats = trapStats(
      trap({
        removedAt: '2026-09-11T06:00',
        checks: [
          round('a', '2026-09-03T06:00', 'caught', { heads: 1 }),
          round('b', '2026-09-05T06:00', 'bycatch', { heads: 1 }),
          round('c', '2026-09-07T06:00', 'caught', { heads: 2 }),
          round('d', '2026-09-08T06:00', 'trouble'),
          round('e', '2026-09-09T06:00', 'nothing'),
        ],
      }),
      at('2026-09-30T00:00:00'),
    );
    expect(stats.trapDays).toBe(10);
    expect(stats).toMatchObject({ rounds: 5, catchRounds: 2, heads: 3, bycatchHeads: 1, troubleRounds: 1 });
    expect(stats.headsPer100TrapDays).toBe(30);
    expect(stats.bycatchPercent).toBe(25);
  });

  it('runs a trap still set to the clock and shows no rate before one trap-day', () => {
    const set = trap({ installedAt: '2026-09-01T06:00' });
    expect(trapStats(set, at('2026-09-01T18:00:00')).headsPer100TrapDays).toBeNull();
    expect(trapStats(set, at('2026-09-03T06:00:00')).trapDays).toBe(2);
  });

  it('leaves rounds without a count out of the heads and says how many', () => {
    const stats = trapStats(trap({ checks: [round('a', '2026-09-03T06:00', 'caught')] }), at('2026-09-11T06:00:00'));
    expect(stats).toMatchObject({ catchRounds: 1, heads: 0, uncountedRounds: 1 });
    expect(stats.bycatchPercent).toBeNull();
  });

  it('adds effort and catches over every trap before taking the rate', () => {
    const now = at('2026-09-11T06:00:00');
    const total = totalStats(
      [
        trap({ id: 'a', checks: [round('x', '2026-09-03T06:00', 'caught', { heads: 1 })] }),
        trap({ id: 'b', installedAt: '2026-09-06T06:00' }),
      ],
      now,
    );
    expect(total.trapDays).toBe(15);
    expect(total.headsPer100TrapDays).toBeCloseTo(100 / 15, 10);
  });
});

describe('work time and the daily report', () => {
  it('counts a stretch to the minute and an open one to the clock', () => {
    const done = { id: 'w', start: '2026-09-02T06:00', end: '2026-09-02T08:45', note: '' };
    expect(sessionMinutes(done, 0)).toBe(165);
    expect(sessionMinutes({ ...done, end: null }, at('2026-09-02T07:30:59'))).toBe(90);
    expect(formatWorkMinutes(165, 'ja')).toBe('2 時間 45 分');
    expect(formatWorkMinutes(165, 'en')).toBe('2 h 45 min');
  });

  it('puts work and rounds on the day they happened, within the month asked for', () => {
    const traps = [
      trap({
        id: 'a',
        checks: [
          round('1', '2026-09-02T06:30', 'caught', { heads: 1, species: 'ニホンジカ' }),
          round('2', '2026-09-02T17:00', 'nothing'),
          round('3', '2026-10-01T06:30', 'nothing'),
        ],
      }),
      trap({ id: 'b', checks: [round('4', '2026-09-02T07:00', 'bycatch', { heads: 1 })] }),
    ];
    const work = [
      { id: 'w2', start: '2026-09-02T16:30', end: '2026-09-02T17:30', note: '夕方' },
      { id: 'w1', start: '2026-09-02T06:00', end: '2026-09-02T08:00', note: '見回り' },
      // Crossing midnight: the whole stretch counts on the day it started.
      { id: 'w3', start: '2026-09-05T23:00', end: '2026-09-06T01:00', note: '' },
    ];
    const rows = buildDailyReport(traps, work, '2026-09', 0);
    expect(rows.map((row) => row.date)).toEqual(['2026-09-02', '2026-09-05']);
    expect(rows[0]).toMatchObject({
      workMinutes: 180,
      rounds: 3,
      trapsChecked: 2,
      heads: 1,
      bycatchHeads: 1,
      species: [{ name: 'ニホンジカ', heads: 1 }],
    });
    expect(rows[0]?.sessions.map((session) => session.id)).toEqual(['w1', 'w2']);
    expect(rows[1]?.workMinutes).toBe(120);

    const csv = buildDailyReportCsv(rows, 'ja').split('\r\n');
    expect(csv[0]).toBe(
      '日付,作業時間（分）,作業の時間帯,見回り回数,見回ったわな,捕獲（頭）,捕獲の内訳,錯誤捕獲（頭）,作動・破損,頭数未記録,作業メモ',
    );
    expect(csv[1]).toBe('2026-09-02,180,06:00–08:00、16:30–17:30,3,2,1,ニホンジカ 1,1,0,0,見回り / 夕方');
    expect(csv[2]).toBe('2026-09-05,120,23:00–2026-09-06 01:00,0,0,0,,0,0,0,');
  });
});

describe('the calendar file', () => {
  it('has one event at the end of each set trap’s interval, in UTC, with an alarm', () => {
    const now = at('2026-09-02T12:00:00');
    const { ics, events } = buildTrapIcs(
      [
        trap({ id: 'a', installedAt: '2026-09-02T06:00', latitude: 35.1, longitude: 139.2, location: '沢, 分岐' }),
        trap({ id: 'b', removedAt: '2026-09-02T07:00' }),
      ],
      24,
      now,
      'ja',
    );
    expect(events).toBe(1);
    const due = new Date(at('2026-09-03T06:00:00')).toISOString().replace(/[-:]/g, '').replace('.000', '');
    expect(ics).toContain(`DTSTART:${due}\r\n`);
    expect(ics).toContain('SUMMARY:わなの見回り：沢 1 号\r\n');
    expect(ics).toContain('LOCATION:沢\\, 分岐\r\n');
    expect(ics).toContain('GEO:35.1;139.2\r\n');
    expect(ics).toContain('BEGIN:VALARM\r\nACTION:DISPLAY');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('folds long lines at 75 octets without splitting a character', () => {
    const line = `SUMMARY:${'あ'.repeat(40)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n ');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(parts.join('')).toBe(line);
  });
});

describe('positions', () => {
  it('keeps six decimal places of a coordinate', () => {
    expect(roundCoordinate(35.123456789)).toBe(35.123457);
  });
});
