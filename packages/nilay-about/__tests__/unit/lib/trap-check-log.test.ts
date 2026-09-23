import { describe, expect, it } from 'vitest';

import { isLocalDateTime, validateTrapDraft, type Trap, type TrapDraft } from '@/lib/schemas/trap-check-log';
import {
  buildTrapCheckCsv,
  formatDuration,
  getTrapStatus,
  latestCheck,
  orderForRound,
  parseLocalDateTime,
  splitDuration,
  summarizeTraps,
  toLocalDateTime,
  validateCheckTime,
} from '@/lib/trap-check-log';

const HOUR = 3_600_000;
const MINUTE = 60_000;
// Local wall-clock times, read the same way the page reads them, so the tests hold in any time zone.
const at = (value: string) => new Date(value).getTime();

const trap = (overrides: Partial<Trap> = {}): Trap => ({
  id: 't1',
  name: '沢 1 号',
  kind: 'kukuri',
  installedAt: '2026-09-20T06:00',
  location: '',
  latitude: null,
  longitude: null,
  removedAt: null,
  checks: [],
  ...overrides,
});

const check = (id: string, when: string, result: 'nothing' | 'caught' = 'nothing', note = '') => ({
  id,
  at: when,
  result,
  note,
});

describe('local date-times', () => {
  it('accepts the datetime-local shape and refuses dates that do not exist', () => {
    expect(isLocalDateTime('2026-09-23T06:30')).toBe(true);
    expect(isLocalDateTime('2028-02-29T00:00')).toBe(true);
    expect(isLocalDateTime('2026-02-29T00:00')).toBe(false);
    expect(isLocalDateTime('2026-09-31T00:00')).toBe(false);
    expect(isLocalDateTime('2026-09-23T24:00')).toBe(false);
    expect(isLocalDateTime('2026-09-23 06:30')).toBe(false);
    expect(isLocalDateTime('')).toBe(false);
  });

  it('reads and writes the same minute on the device clock', () => {
    expect(parseLocalDateTime('2026-09-23T06:30')).toBe(at('2026-09-23T06:30:00'));
    expect(toLocalDateTime(at('2026-09-23T06:30:59'))).toBe('2026-09-23T06:30');
    expect(parseLocalDateTime('bad')).toBeNull();
  });
});

describe('time since the last round', () => {
  it('counts from the setting time until the first round', () => {
    const status = getTrapStatus(trap(), 24, at('2026-09-20T18:00'));
    expect(status).toMatchObject({ state: 'ok', since: 'installed', elapsedMs: 12 * HOUR, remainingMs: 12 * HOUR });
  });

  it('is due, not overdue, at exactly the interval, and overdue a minute later', () => {
    const base = trap({ checks: [check('c1', '2026-09-21T07:00')] });
    expect(getTrapStatus(base, 24, at('2026-09-22T07:00'))).toMatchObject({ state: 'ok', remainingMs: 0 });
    expect(getTrapStatus(base, 24, at('2026-09-22T07:01'))).toMatchObject({
      state: 'overdue',
      since: 'check',
      elapsedMs: 24 * HOUR + MINUTE,
      remainingMs: -MINUTE,
    });
  });

  it('reads the clock to the minute, as the rounds are recorded', () => {
    const base = trap({ checks: [check('c1', '2026-09-22T12:00')] });
    // A round saved 30 seconds into its minute has a full interval left, not 23 h 59 min.
    expect(getTrapStatus(base, 24, at('2026-09-22T12:00:30'))).toMatchObject({
      state: 'ok',
      elapsedMs: 0,
      remainingMs: 24 * HOUR,
    });
    expect(getTrapStatus(base, 24, at('2026-09-22T12:01:00'))).toMatchObject({ elapsedMs: MINUTE });
    // Due through the last minute of the interval, overdue from the next.
    expect(getTrapStatus(base, 24, at('2026-09-23T12:00:59'))).toMatchObject({ state: 'ok', remainingMs: 0 });
    expect(getTrapStatus(base, 24, at('2026-09-23T12:01:00'))).toMatchObject({ state: 'overdue' });
  });

  it('takes the latest round by its time, not by the order it was entered', () => {
    const late = trap({ checks: [check('c2', '2026-09-22T06:00'), check('c1', '2026-09-21T06:00')] });
    expect(latestCheck(late)?.id).toBe('c2');
    expect(getTrapStatus(late, 12, at('2026-09-22T17:00'))).toMatchObject({ state: 'ok', elapsedMs: 11 * HOUR });
  });

  it('flags a round recorded after the current time instead of hiding the trap', () => {
    const status = getTrapStatus(trap({ checks: [check('c1', '2026-09-25T06:00')] }), 24, at('2026-09-23T06:00'));
    expect(status).toEqual({ state: 'future', baseAt: '2026-09-25T06:00' });
  });

  it('counts from the setting time when every round is dated before it, and says so', () => {
    const status = getTrapStatus(trap({ checks: [check('c1', '2026-09-19T06:00')] }), 24, at('2026-09-20T10:00'));
    expect(status).toMatchObject({ state: 'ok', since: 'installedBeforeChecks', elapsedMs: 4 * HOUR });
  });

  it('refuses to record a round before the setting time', () => {
    const base = trap({ installedAt: '2026-09-20T06:00' });
    expect(validateCheckTime(base, '2026-09-20T05:59')).toBe('beforeInstalled');
    expect(validateCheckTime(base, '2026-09-20T06:00')).toBeNull();
    expect(validateCheckTime(base, '2026-09-20')).toBe('invalid');
  });

  it('does not watch a trap that is removed or not yet set', () => {
    expect(getTrapStatus(trap({ removedAt: '2026-09-22T08:00' }), 24, at('2026-09-30T00:00'))).toEqual({
      state: 'removed',
      removedAt: '2026-09-22T08:00',
    });
    expect(getTrapStatus(trap(), 24, at('2026-09-20T05:59'))).toEqual({
      state: 'notInstalled',
      installedAt: '2026-09-20T06:00',
    });
  });
});

describe('durations', () => {
  it('rounds down to the minute so a trap never looks checked more recently than it was', () => {
    expect(splitDuration(HOUR - 1)).toEqual({ days: 0, hours: 0, minutes: 59 });
    expect(splitDuration(26 * HOUR + 5 * MINUTE)).toEqual({ days: 1, hours: 2, minutes: 5 });
    expect(splitDuration(-5)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it('always writes the minutes, beyond a day as well', () => {
    expect(formatDuration(0, 'ja')).toBe('0 分');
    expect(formatDuration(3 * HOUR + 7 * MINUTE, 'ja')).toBe('3 時間 7 分');
    // 49 h 30 min = 2 days, 1 hour, 30 minutes.
    expect(formatDuration(49 * HOUR + 30 * MINUTE, 'ja')).toBe('2 日 1 時間 30 分');
    expect(formatDuration(24 * HOUR + 59 * MINUTE, 'ja')).toBe('1 日 0 時間 59 分');
    expect(formatDuration(24 * HOUR, 'en')).toBe('1 d 0 h 0 min');
    expect(formatDuration(45 * MINUTE, 'en')).toBe('45 min');
  });
});

describe('the round as a whole', () => {
  const now = at('2026-09-22T12:00');
  const traps = [
    trap({ id: 'fresh', installedAt: '2026-09-22T06:00' }),
    trap({ id: 'removed', removedAt: '2026-09-21T00:00' }),
    trap({ id: 'oldest', installedAt: '2026-09-20T06:00' }),
    trap({ id: 'checked', checks: [check('c', '2026-09-21T10:00')] }),
    trap({ id: 'slip', checks: [check('c', '2026-09-23T10:00')] }),
  ];

  it('counts set, overdue and removed traps', () => {
    // oldest: 54 h since setting; checked: 26 h since the round; fresh: 6 h.
    expect(summarizeTraps(traps, 24, now)).toEqual({ active: 4, overdue: 2, removed: 1 });
    expect(summarizeTraps(traps, 26, now)).toEqual({ active: 4, overdue: 1, removed: 1 });
  });

  it('puts a future time first, then the longest wait, and removed traps last', () => {
    expect(orderForRound(traps, 24, now).map((item) => item.id)).toEqual([
      'slip',
      'oldest',
      'checked',
      'fresh',
      'removed',
    ]);
  });
});

describe('the registration form', () => {
  const draft = (overrides: Partial<TrapDraft> = {}): TrapDraft => ({
    name: ' 沢 1 号 ',
    kind: 'hako',
    installedAt: '2026-09-23T06:00',
    location: '',
    latitude: '',
    longitude: '',
    ...overrides,
  });

  it('trims the name and leaves coordinates out when both are empty', () => {
    expect(validateTrapDraft(draft())).toMatchObject({
      valid: true,
      value: { name: '沢 1 号', kind: 'hako', latitude: null, longitude: null },
    });
  });

  it('requires a name and a setting time', () => {
    expect(validateTrapDraft(draft({ name: '  ', installedAt: '' })).errors).toEqual({
      name: 'required',
      installedAt: 'required',
    });
  });

  it('checks each coordinate, its range and its pair', () => {
    expect(validateTrapDraft(draft({ latitude: '35.6581', longitude: '139.7414' }))).toMatchObject({
      valid: true,
      value: { latitude: 35.6581, longitude: 139.7414 },
    });
    expect(validateTrapDraft(draft({ latitude: '90', longitude: '-180' })).valid).toBe(true);
    expect(validateTrapDraft(draft({ latitude: '90.1', longitude: '180.5' })).errors).toEqual({
      latitude: 'outOfRange',
      longitude: 'outOfRange',
    });
    expect(validateTrapDraft(draft({ latitude: '35', longitude: '' })).errors).toEqual({ longitude: 'pairMissing' });
    expect(validateTrapDraft(draft({ latitude: '1e2', longitude: '35,6' })).errors).toEqual({
      latitude: 'invalid',
      longitude: 'invalid',
    });
  });

  it('limits the name to 60 characters', () => {
    expect(validateTrapDraft(draft({ name: 'あ'.repeat(60) })).valid).toBe(true);
    expect(validateTrapDraft(draft({ name: 'あ'.repeat(61) })).errors).toEqual({ name: 'tooLong' });
  });
});

describe('the CSV', () => {
  it('writes one row per round, a row for a trap without one, and keeps typed text inert', () => {
    const csv = buildTrapCheckCsv(
      [
        trap({
          name: '=SUM(A1)',
          location: '林道, 分岐 "北"',
          latitude: 35.5,
          longitude: 139.25,
          checks: [check('b', '2026-09-22T06:00', 'caught', '-メス'), check('a', '2026-09-21T06:00')],
        }),
        trap({ id: 't2', name: '尾根', kind: 'hako', removedAt: '2026-09-22T09:00' }),
      ],
      'ja',
    );
    expect(csv.split('\r\n')).toEqual([
      '識別名,種類,設置日時,撤去日時,場所メモ,緯度,経度,見回り日時,結果,メモ',
      `'=SUM(A1),くくりわな,2026-09-20 06:00,,"林道, 分岐 ""北""",35.5,139.25,2026-09-21 06:00,異常なし,`,
      `'=SUM(A1),くくりわな,2026-09-20 06:00,,"林道, 分岐 ""北""",35.5,139.25,2026-09-22 06:00,捕獲あり,'-メス`,
      '尾根,はこわな,2026-09-20 06:00,2026-09-22 09:00,,,,,,',
    ]);
  });

  it('uses English headers and labels in English', () => {
    const csv = buildTrapCheckCsv([trap({ checks: [check('a', '2026-09-21T06:00')] })], 'en');
    expect(csv.split('\r\n')[1]).toBe('沢 1 号,Snare,2026-09-20 06:00,,,,,2026-09-21 06:00,Nothing caught,');
  });
});
