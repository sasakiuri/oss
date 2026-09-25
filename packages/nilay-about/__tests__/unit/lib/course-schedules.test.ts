import { describe, expect, it } from 'vitest';

import { courseEvents } from '@/lib/course-schedules';
import { COURSE_LINKS } from '@/lib/course-schedules-data';

describe('courseEvents', () => {
  it('turns complete dates into events in date order and skips the rest', () => {
    const events = courseEvents(
      [
        { id: 'b', kind: 'skillCourse', date: '2026-12-02', end: '', note: '' },
        { id: 'a', kind: 'application', date: '2026-10-01', end: '2026-10-20', note: '初心者講習' },
        { id: 'c', kind: 'huntingExam', date: '', end: '', note: '' },
        { id: 'd', kind: 'other', date: '2026-11-10', end: '2026-11-01', note: '' },
      ],
      'ja',
      [7],
    );
    expect(events).toEqual([
      {
        uid: 'a@course-schedules.labs.nilay.jp',
        start: '2026-10-01',
        end: '2026-10-20',
        summary: '申込み：初心者講習',
        alarmDaysBefore: [7],
      },
      {
        uid: 'b@course-schedules.labs.nilay.jp',
        start: '2026-12-02',
        end: undefined,
        summary: '技能講習',
        alarmDaysBefore: [7],
      },
    ]);
  });
});

describe('the collected links', () => {
  it('lists each prefecture once, with official https pages only', () => {
    expect(new Set(COURSE_LINKS.map((entry) => entry.prefecture)).size).toBe(COURSE_LINKS.length);
    const urls = COURSE_LINKS.flatMap((entry) =>
      [entry.huntingExam, entry.firearmsCourse, entry.skillCourse].flatMap((link) => (link ? [link.url] : [])),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^https:\/\/[^/]*(pref|metro\.tokyo|police)[^/]*\//);
  });
});
