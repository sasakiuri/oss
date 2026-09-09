// SPDX-License-Identifier: MIT

import { z } from 'zod';

export const EstComplaintIssueSchema = z.enum([
  'SHOT_VALUE',
  'SHOT_NOT_REGISTERED',
  'TARGET_FAILURE',
  'TARGET_MEDIA_ADVANCE',
  'OTHER',
]);

export const EstComplaintLastShotSchema = z.object({
  shotId: z.string().uuid(),
  shotNumberInSeries: z.number().int().positive(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
});

export const EstComplaintRuleContextSchema = z.object({
  round: z.enum(['ELIMINATION', 'QUALIFICATION', 'FINAL']),
  identity: z.object({
    id: z.string().min(1),
    schemaVersion: z.literal(1),
    fingerprint: z.object({ algorithm: z.literal('SHA-256'), value: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
  procedures: z
    .array(
      z.object({
        phase: z.enum(['SIGHTING', 'MATCH']),
        issue: EstComplaintIssueSchema,
        review: z.enum(['SCORE_PROTEST', 'EST_COMPLAINT', 'FINAL_EST_COMPLAINT', 'OFFICIAL_REVIEW']),
        ruleReference: z.string().min(1),
        athleteGuidance: z.string().min(1),
        officialGuidance: z.string().min(1),
      }),
    )
    .readonly()
    .superRefine((procedures, context) => {
      const keys = procedures.map((procedure) => `${procedure.phase}:${procedure.issue}`);
      if (new Set(keys).size !== keys.length)
        context.addIssue({ code: 'custom', message: 'Duplicate EST complaint procedures' });
    }),
});

export const EstComplaintSignalContextSchema = z
  .object({
    rules: EstComplaintRuleContextSchema.optional(),
    missingShotProcedure: z
      .object({
        notification: z.enum(['BEFORE_NEXT_SHOT', 'AFTER_SERIES']),
        seriesRepeatAllowed: z.literal(false),
        ruleReference: z.string().min(1),
      })
      .optional(),
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
    lastShot: EstComplaintLastShotSchema.nullable(),
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

export const EstComplaintSignalPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    laneId: z.string().uuid(),
    status: z.enum(['ACTIVE', 'CLEARED']),
    signalId: z.string().uuid().nullable(),
    issue: EstComplaintIssueSchema.nullable(),
    context: EstComplaintSignalContextSchema.nullable(),
    message: z.string().max(500).nullable(),
    signalledAt: z.string().datetime().nullable(),
    clearedAt: z.string().datetime().nullable(),
    clearedBy: z.string().min(1).nullable(),
    publishedAt: z.string().datetime(),
  })
  .superRefine((state, context) => {
    if (state.status === 'ACTIVE') {
      if (!state.signalId || !state.issue || !state.context || !state.signalledAt) {
        context.addIssue({ code: 'custom', message: 'An active signal requires identity, issue, context and time' });
      }
      if (state.clearedAt || state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'An active signal cannot contain clearance data' });
      }
      return;
    }

    if (state.signalId) {
      if (!state.issue || !state.context || !state.signalledAt || !state.clearedAt || !state.clearedBy) {
        context.addIssue({ code: 'custom', message: 'A cleared signal history is incomplete' });
      }
      return;
    }

    if (state.issue || state.context || state.message || state.signalledAt || state.clearedAt || state.clearedBy) {
      context.addIssue({ code: 'custom', message: 'An empty cleared state cannot contain signal history' });
    }
  });

export type EstComplaintIssue = z.infer<typeof EstComplaintIssueSchema>;
export type EstComplaintSignalPayload = z.infer<typeof EstComplaintSignalPayloadSchema>;
