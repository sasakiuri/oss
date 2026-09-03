// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const RangeOfficerRequestPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    laneId: z.string().uuid(),
    status: z.enum(['ACTIVE', 'CLEARED']),
    requestId: z.string().uuid().nullable(),
    category: z.enum(['ASSISTANCE', 'EQUIPMENT', 'TARGET', 'SCORING', 'SAFETY', 'OTHER']).nullable(),
    message: z.string().max(500).nullable(),
    requestedAt: z.string().datetime().nullable(),
    clearedAt: z.string().datetime().nullable(),
    clearedBy: z.string().nullable(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((state, context) => {
    if (state.status === 'ACTIVE') {
      if (!state.requestId || !state.category || !state.requestedAt) {
        context.addIssue({ code: 'custom', message: 'An active request requires identity, category and time' });
      }
      if (state.clearedAt || state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'An active request cannot contain clearance data' });
      }
    } else if (state.requestId && (!state.category || !state.requestedAt || !state.clearedAt || !state.clearedBy)) {
      context.addIssue({ code: 'custom', message: 'A cleared request history is incomplete' });
    }
  });

export type RangeOfficerRequestPayload = z.infer<typeof RangeOfficerRequestPayloadSchema>;
