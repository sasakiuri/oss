import { z } from 'zod';

import { prefectureSchema } from './hunting-log';
import { optionalDateSchema } from './permit-deadlines';

export const COURSE_KINDS = ['huntingExam', 'firearmsCourse', 'skillCourse', 'application', 'other'] as const;
export const courseKindSchema = z.enum(COURSE_KINDS);
export type CourseKind = z.infer<typeof courseKindSchema>;

export const COURSE_DATES_MAX = 20;
export const COURSE_NOTE_MAX = 60;

export const courseDateSchema = z.object({
  id: z.string().min(1).max(40),
  kind: courseKindSchema,
  date: optionalDateSchema,
  /** The last day of a period such as an application window; empty for one day. */
  end: optionalDateSchema,
  note: z.string().max(COURSE_NOTE_MAX),
});
export type CourseDate = z.infer<typeof courseDateSchema>;

export const courseSchedulesSettingsSchema = z.object({
  prefecture: prefectureSchema,
  dates: z.array(courseDateSchema).max(COURSE_DATES_MAX),
});
export type CourseSchedulesSettings = z.infer<typeof courseSchedulesSettingsSchema>;
