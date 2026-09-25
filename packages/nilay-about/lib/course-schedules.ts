/**
 * Links to the official schedules of the hunting licence exam and the firearms courses, and the
 * reader's own dates for them as calendar events.
 *
 * Schedules are published by each prefecture and change through the year, so the tool does not
 * copy dates: it links to the pages (course-schedules-data.ts) and turns the dates the reader has
 * chosen into an .ics file.
 */

import { isIsoDate } from './calendar-days';
import type { IcsEvent } from './ics';
import type { CourseDate, CourseKind } from './schemas/course-schedules';
import type { Prefecture } from './schemas/hunting-log';

export interface CourseLink {
  title: string;
  url: string;
  yearSpecific: boolean;
}

export interface CourseLinks {
  prefecture: Prefecture;
  huntingExam?: CourseLink;
  firearmsCourse?: CourseLink;
  skillCourse?: CourseLink;
}

export const COURSE_KIND_NAMES: Record<CourseKind, { ja: string; en: string }> = {
  huntingExam: { ja: '狩猟免許試験', en: 'Hunting licence exam' },
  firearmsCourse: { ja: '猟銃等講習会', en: 'Firearms safety course' },
  skillCourse: { ja: '技能講習', en: 'Skills course' },
  application: { ja: '申込み', en: 'Application' },
  other: { ja: 'その他', en: 'Other' },
};

export const LINK_KINDS = ['huntingExam', 'firearmsCourse', 'skillCourse'] as const;

/** The reader's dates as all-day events; entries without a date are left out. */
export function courseEvents(
  dates: readonly CourseDate[],
  language: 'ja' | 'en',
  alarmDaysBefore: readonly number[],
): IcsEvent[] {
  return dates
    .filter((entry) => isIsoDate(entry.date) && (entry.end === '' || (isIsoDate(entry.end) && entry.end >= entry.date)))
    .map((entry) => {
      const kind = COURSE_KIND_NAMES[entry.kind][language];
      const note = entry.note.trim();
      return {
        uid: `${entry.id}@course-schedules.labs.nilay.jp`,
        start: entry.date,
        end: entry.end || undefined,
        summary: note ? `${kind}：${note}` : kind,
        alarmDaysBefore,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
