// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const ReserveLaneTransferRequestSchema = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  sourceLaneId: z.string().uuid(),
  destinationLaneId: z.string().uuid(),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
});
/** The transport carries an opaque, versioned Lane snapshot; Director never rewrites it. */
export const ReserveLaneTransferBundleSchema = z.object({
  version: z.literal(1),
  request: ReserveLaneTransferRequestSchema,
  sourceSafetyStopId: z.string().uuid(),
  capturedAt: z.string().datetime(),
  summary: z.object({
    athleteId: z.string().min(1),
    athleteName: z.string().min(1),
    matchShots: z.number().int().nonnegative(),
    totalScoreX10: z.number().int().nonnegative(),
    remainingSeconds: z.number().nonnegative(),
    rulePackFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  competitionJson: z.string().min(1).max(200000),
  sessionJson: z.string().min(1).max(2000000),
  assignmentJson: z.string().min(1).max(10000),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
});
const reference = z.object({ id: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) });
export const ReserveLaneTransferActionSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('PREPARE_SOURCE'), request: ReserveLaneTransferRequestSchema }),
  z.object({ operation: z.literal('STAGE_TARGET'), bundle: ReserveLaneTransferBundleSchema }),
  reference.extend({ operation: z.literal('RETIRE_SOURCE') }),
  reference.extend({ operation: z.literal('CANCEL_SOURCE') }),
  z.object({ operation: z.literal('CANCEL_TARGET'), bundle: ReserveLaneTransferBundleSchema }),
  reference.extend({ operation: z.literal('ACTIVATE_TARGET'), sourceRetired: z.literal(true) }),
]);
export type ReserveLaneTransferRequest = z.infer<typeof ReserveLaneTransferRequestSchema>;
export type ReserveLaneTransferBundle = z.infer<typeof ReserveLaneTransferBundleSchema>;
export type ReserveLaneTransferAction = z.infer<typeof ReserveLaneTransferActionSchema>;
