// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { ReserveLaneTransferBundleSchema, ReserveLaneTransferRequestSchema } from '@/shared/mqtt/ReserveLaneTransfer';

import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

const grant = z.object({
  id: z.string().uuid(),
  transferId: z.string().uuid(),
  remainingSeconds: z.number().int().positive().max(86400),
  unlimitedSightingShots: z.boolean(),
  officialName: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(2000),
});
const workspace = z.array(
  z.object({
    request: ReserveLaneTransferRequestSchema,
    bundle: ReserveLaneTransferBundleSchema.nullable(),
    entries: z.array(
      z.object({
        id: z.string(),
        transferId: z.string(),
        operation: z.string(),
        recordedAt: z.string(),
        detail: z.unknown(),
      }),
    ),
  }),
);
export type ReserveTransferWorkspaceDto = z.infer<typeof workspace>;
export const reserveLaneTransfersContract = defineContract('reserveLaneTransfers', {
  workspace: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(workspace)),
  prepare: command(ReserveLaneTransferRequestSchema, commandDataResponseSchema(ReserveLaneTransferBundleSchema)),
  complete: command(
    z.object({ id: z.string().uuid(), expectedDigest: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }),
    commandDataResponseSchema(ReserveLaneTransferBundleSchema),
  ),
  cancel: command(
    z.object({ id: z.string().uuid(), officialName: z.string().trim().min(1), statement: z.string().trim().min(1) }),
    CommandResponseSchema,
  ),
  resume: command(grant, CommandResponseSchema),
  resumeMatch: command(z.object({ id: z.string().uuid() }), CommandResponseSchema),
});
