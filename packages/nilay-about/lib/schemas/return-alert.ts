import { z } from 'zod';

import { GRACE_MINUTES_OPTIONS, RETURN_NOTE_MAX_LENGTH } from '@/lib/return-alert';

import { subscriptionRequestSchema } from './push';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,64}$/);
export const planIdSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const graceMinutesSchema = z
  .number()
  .refine((value) => (GRACE_MINUTES_OPTIONS as readonly number[]).includes(value));

/**
 * What a plan holds. The note is the only free text: where the person went, so watchers know where
 * to look. The entry plan card of the hunting tools can fill it and the return time in.
 */
export const returnPlanFieldsSchema = z.object({
  /** An ISO 8601 instant with its offset, such as `2026-11-15T17:00:00+09:00`. */
  returnAt: z.string().datetime({ offset: true }),
  graceMinutes: graceMinutesSchema,
  note: z.string().trim().max(RETURN_NOTE_MAX_LENGTH),
});

export const createReturnPlanSchema = subscriptionRequestSchema.merge(returnPlanFieldsSchema);

export const watchReturnPlanSchema = subscriptionRequestSchema.extend({ planId: planIdSchema, token: tokenSchema });
export const returnPlanTokenSchema = z.object({ planId: planIdSchema, token: tokenSchema });
export const updateReturnPlanSchema = returnPlanTokenSchema.extend({ returnAt: z.string().datetime({ offset: true }) });

export const returnPlanViewSchema = z.object({
  returnAt: z.string(),
  graceMinutes: z.number(),
  note: z.string(),
  watchers: z.number(),
  status: z.enum(['before', 'grace', 'overdue']),
});
export type ReturnPlanView = z.infer<typeof returnPlanViewSchema>;

export const createdReturnPlanSchema = z.object({
  planId: z.string(),
  ownerToken: z.string(),
  watchToken: z.string(),
  plan: returnPlanViewSchema,
});
