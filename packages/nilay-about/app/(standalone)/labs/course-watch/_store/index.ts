import { z } from 'zod';

import { createSavedStore, hasPassed } from '@/features/labs-notify/saved-store';
import { WATCHED_PAGE_IDS } from '@/lib/course-watch';

export const COURSE_WATCH_STORAGE_KEY = 'nilay-labs-course-watch-v1';

const savedSchema = z.object({
  pages: z.array(z.enum(WATCHED_PAGE_IDS)),
  registeredUntil: z.string().nullable(),
});
export type CourseWatchSaved = z.infer<typeof savedSchema>;

export const useCourseWatchStore = createSavedStore<CourseWatchSaved>(
  COURSE_WATCH_STORAGE_KEY,
  savedSchema,
  { pages: [], registeredUntil: null },
  (value, nowMs) =>
    value.registeredUntil && hasPassed(value.registeredUntil, nowMs) ? { ...value, registeredUntil: null } : value,
);
