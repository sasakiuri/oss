import { describe, expect, it } from 'vitest';

import { buildIcs, escapeText, foldLine, localToDate, tripProblems, type TripPlan } from '@/lib/trip-plan';

const plan: TripPlan = {
  hunter: '山田 太郎',
  companions: '佐藤',
  area: '○○山 北斜面',
  route: '林道入口から尾根へ',
  departAt: '2026-11-15T06:00',
  returnBy: '2026-11-15T16:30',
  vehicle: '白の軽トラ',
  radio: '',
  gear: '',
  contactName: '山田 花子',
  contactPhone: '090-0000-0000',
  ifLate: '',
  notes: '',
};

describe('the times', () => {
  it('reads a local date and time and refuses a day that does not exist', () => {
    expect(localToDate('2026-11-15T06:00')?.getHours()).toBe(6);
    expect(localToDate('2026-02-30T06:00')).toBeNull();
  });

  it('asks for a return after the departure', () => {
    expect(tripProblems(plan)).toEqual([]);
    expect(tripProblems({ departAt: '2026-11-15T06:00', returnBy: '2026-11-15T05:00' })).toEqual(['order']);
    expect(tripProblems({ departAt: '', returnBy: '' })).toEqual(['depart', 'return']);
  });
});

describe('iCalendar', () => {
  it('escapes text and folds long lines at 75 octets without splitting a character', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const folded = foldLine(`DESCRIPTION:${'あ'.repeat(40)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'あ'.repeat(40)}`);
  });

  it('writes one event from departure to the time due back, with an alarm at the end', () => {
    const ics = buildIcs(
      plan,
      {
        summary: '出猟: ○○山',
        alarm: '帰着予定の時刻です',
        lines: [
          ['同行者', '佐藤'],
          ['無線', ''],
        ],
      },
      'uid-1@nilay',
      new Date(Date.UTC(2026, 10, 1)),
    )!;
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(unfolded).toContain(
      `DTSTART:${localToDate(plan.departAt)!.toISOString().replace(/[-:]/g, '').replace('.000', '')}`,
    );
    expect(unfolded).toContain('TRIGGER;RELATED=END:PT0M');
    expect(unfolded).toContain('DESCRIPTION:同行者: 佐藤\r\n');
    expect(unfolded).toContain('LOCATION:○○山 北斜面');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('writes nothing for times out of order', () => {
    expect(
      buildIcs({ ...plan, returnBy: plan.departAt }, { summary: '', alarm: '', lines: [] }, 'u', new Date()),
    ).toBeNull();
  });
});
