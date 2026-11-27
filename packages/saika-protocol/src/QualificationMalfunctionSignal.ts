// SPDX-License-Identifier: MIT

import { z } from 'zod';

import { refineSignalContext, signalContextShape } from './SignalContext';

const QualificationMalfunctionSignalContextSchema = z.object(signalContextShape).superRefine(refineSignalContext);

export const QualificationMalfunctionSignalPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    laneId: z.string().uuid(),
    status: z.enum(['ACTIVE', 'CLEARED']),
    signalId: z.string().uuid().nullable(),
    context: QualificationMalfunctionSignalContextSchema.nullable(),
    message: z.string().max(500).nullable(),
    signalledAt: z.string().datetime().nullable(),
    clearedAt: z.string().datetime().nullable(),
    clearedBy: z.string().min(1).nullable(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((state, context) => {
    if (state.status === 'ACTIVE') {
      if (!state.signalId || !state.context || !state.signalledAt) {
        context.addIssue({ code: 'custom', message: 'An active signal requires identity, context and time' });
      }
      if (state.clearedAt || state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'An active signal cannot contain clearance data' });
      }
      return;
    }

    if (state.signalId) {
      if (!state.context || !state.signalledAt || !state.clearedAt || !state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'A cleared signal history is incomplete' });
      }
      return;
    }

    if (state.context || state.message || state.signalledAt || state.clearedAt || state.clearedBy) {
      context.addIssue({ code: 'custom', message: 'An empty cleared state cannot contain signal history' });
    }
  });

export type QualificationMalfunctionSignalPayload = z.infer<typeof QualificationMalfunctionSignalPayloadSchema>;
