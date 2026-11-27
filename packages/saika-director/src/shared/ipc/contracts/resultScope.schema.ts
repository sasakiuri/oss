import { z } from 'zod';

/** The result list a record belongs to. */
export const resultScopeSchema = z.enum(['QUALIFICATION', 'FINAL']);

export type ResultScope = z.infer<typeof resultScopeSchema>;
