import { describe, expect, it } from 'vitest';

import { dateKeySchema, studyLogSchema } from '@/lib/schemas/study-log';
import {
  addDays,
  currentStreak,
  dateKey,
  daysBetween,
  longestStreak,
  recordStudyDay,
  seededRandom,
} from '@/lib/study-log';

describe('day arithmetic', () => {
  it('names the local day of a moment', () => {
    expect(dateKey(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(dateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('crosses months, years and leap days', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(daysBetween('2026-09-24', '2026-11-15')).toBe(52);
    expect(daysBetween('2026-09-24', '2026-09-20')).toBe(-4);
  });

  it('accepts only real calendar days', () => {
    expect(dateKeySchema.safeParse('2026-02-29').success).toBe(false);
    expect(dateKeySchema.safeParse('2028-02-29').success).toBe(true);
    expect(dateKeySchema.safeParse('2026-9-1').success).toBe(false);
  });
});

describe('the study record', () => {
  it('keeps each day once, in order', () => {
    const days = recordStudyDay(recordStudyDay(['2026-09-20'], '2026-09-22'), '2026-09-22');
    expect(days).toEqual(['2026-09-20', '2026-09-22']);
    expect(studyLogSchema.safeParse({ days, examDate: null }).success).toBe(true);
    expect(studyLogSchema.safeParse({ days: ['2026-09-22', '2026-09-20'], examDate: null }).success).toBe(false);
  });

  it('counts the current streak, still alive until today is over', () => {
    const days = ['2026-09-20', '2026-09-22', '2026-09-23'];
    expect(currentStreak(days, '2026-09-23')).toBe(2);
    expect(currentStreak(days, '2026-09-24')).toBe(2);
    expect(currentStreak(days, '2026-09-25')).toBe(0);
    expect(currentStreak([...days, '2026-09-24'], '2026-09-24')).toBe(3);
  });

  it('finds the longest run on record', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-01-01', '2026-01-02', '2026-01-03', '2026-02-01', '2026-02-02'])).toBe(3);
  });
});

describe('the seeded generator', () => {
  it('repeats for the same seed and differs for another', () => {
    const first = seededRandom('2026-09-24:hunting:trap');
    const again = seededRandom('2026-09-24:hunting:trap');
    const other = seededRandom('2026-09-25:hunting:trap');
    const a = [first(), first(), first()];
    expect([again(), again(), again()]).toEqual(a);
    expect([other(), other(), other()]).not.toEqual(a);
    for (const value of a) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of a) expect(value).toBeLessThan(1);
  });
});
