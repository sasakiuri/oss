import { z } from 'zod';

import {
  RESULTS_CELL_MAX_LENGTH,
  RESULTS_COLUMNS_MAX,
  RESULTS_DAYS_OPTIONS,
  RESULTS_NOTE_MAX_LENGTH,
  RESULTS_PASSPHRASE_MAX_LENGTH,
  RESULTS_PASSPHRASE_MIN_LENGTH,
  RESULTS_ROWS_MAX,
  RESULTS_TITLE_MAX_LENGTH,
} from '@/lib/event-results';

export const resultsIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
const cellSchema = z.string().refine((value) => [...value].length <= RESULTS_CELL_MAX_LENGTH);

export const resultsContentSchema = z
  .object({
    title: z.string().trim().min(1).max(RESULTS_TITLE_MAX_LENGTH),
    note: z.string().trim().max(RESULTS_NOTE_MAX_LENGTH),
    columns: z.array(cellSchema).min(1).max(RESULTS_COLUMNS_MAX),
    rows: z.array(z.array(cellSchema)).min(1).max(RESULTS_ROWS_MAX),
  })
  .refine((value) => value.rows.every((row) => row.length === value.columns.length), {
    message: 'Every row needs as many cells as the header',
    path: ['rows'],
  });
export type ResultsContent = z.infer<typeof resultsContentSchema>;

export const passphraseSchema = z.string().min(RESULTS_PASSPHRASE_MIN_LENGTH).max(RESULTS_PASSPHRASE_MAX_LENGTH);

export const createResultsSchema = z.object({
  passphrase: passphraseSchema,
  days: z.number().refine((value) => (RESULTS_DAYS_OPTIONS as readonly number[]).includes(value)),
  content: resultsContentSchema,
});
export const updateResultsSchema = z.object({ passphrase: passphraseSchema, content: resultsContentSchema });
export const deleteResultsSchema = z.object({ passphrase: passphraseSchema });

export const resultsViewSchema = z.object({
  title: z.string(),
  note: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
  updatedAt: z.string(),
  expiresAt: z.string(),
});
export type ResultsView = z.infer<typeof resultsViewSchema>;
export const createdResultsSchema = z.object({ id: z.string(), expiresAt: z.string() });
