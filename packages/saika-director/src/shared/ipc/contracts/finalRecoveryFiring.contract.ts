import { z } from 'zod';
import { MalfunctionFiringEvidenceSchema, MalfunctionFiringRequestSchema } from '@/shared/mqtt/MalfunctionFiring';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const intent = z.object({
  readinessConfirmed: z.literal(true),
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  authorizationId: z.string().uuid(),
  laneId: z.string().uuid(),
  loadAt: z.string().datetime(),
});
const record = z.object({
  intent,
  request: MalfunctionFiringRequestSchema,
  evidence: MalfunctionFiringEvidenceSchema.nullable(),
});
export type FinalFiringRecordDto = z.infer<typeof record>;
export const finalRecoveryFiringContract = defineContract('finalRecoveryFiring', {
  list: query(z.object({ caseId: z.string().uuid() }), queryResponseSchema(z.array(record))),
  start: command(intent, commandDataResponseSchema(record)),
  read: command(z.object({ id: z.string().uuid() }), commandDataResponseSchema(record)),
  cancel: command(
    z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
    commandDataResponseSchema(record),
  ),
});
