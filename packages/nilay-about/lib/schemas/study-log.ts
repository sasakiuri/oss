import { z } from 'zod';

/**
 * A calendar day as the reader's own clock names it, `YYYY-MM-DD`. Days are kept as names rather
 * than instants: "studied on the 3rd" means the 3rd wherever the reader was, and two instants an
 * hour apart can fall on different days or the same one depending on where they are read.
 */
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((key) => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }, 'Not a calendar day');
export type DateKey = z.infer<typeof dateKeySchema>;

/** How many study days are kept. A year and a bit is enough for any streak worth showing. */
export const STUDY_DAYS_KEPT = 400;

export const studyLogSchema = z.object({
  // Oldest first, each day once.
  days: z
    .array(dateKeySchema)
    .max(STUDY_DAYS_KEPT)
    .refine((days) => days.every((day, index) => index === 0 || (days[index - 1] as string) < day), {
      message: 'Study days have to be in order, each one once',
    }),
  examDate: dateKeySchema.nullable(),
});
export type StudyLog = z.infer<typeof studyLogSchema>;
