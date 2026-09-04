// SPDX-License-Identifier: MIT

import { z } from 'zod';

export const QualificationMalfunctionSignalContextSchema = z
  .object({
    competitionId: z.string().uuid(),
    sessionId: z.string().uuid(),
    participantId: z.string().min(1),
    participantName: z.string().min(1),
    startNumber: z.string().min(1).nullable(),
    phase: z.enum(['SIGHTING', 'MATCH']),
    stageIndex: z.number().int().nonnegative(),
    seriesIndex: z.number().int().nonnegative(),
    seriesShotLimit: z.number().int().positive().nullable(),
    recordedShots: z.number().int().nonnegative(),
    timedTargetProgramId: z.string().min(1).nullable(),
    exposureIndex: z.number().int().nonnegative().nullable(),
  })
  .superRefine((snapshot, context) => {
    if (snapshot.seriesShotLimit !== null && snapshot.recordedShots > snapshot.seriesShotLimit) {
      context.addIssue({
        code: 'custom',
        path: ['recordedShots'],
        message: 'Recorded shots cannot exceed the series shot limit',
      });
    }
    if (snapshot.exposureIndex !== null && !snapshot.timedTargetProgramId) {
      context.addIssue({
        code: 'custom',
        path: ['exposureIndex'],
        message: 'An exposure index requires a timed-target program',
      });
    }
  });

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
