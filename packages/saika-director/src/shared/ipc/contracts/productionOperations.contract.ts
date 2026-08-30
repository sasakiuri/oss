import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const action = z.enum([
  'MUSIC_PROGRAM_APPROVED',
  'MUSIC_PROGRAM_APPROVAL_REVOKED',
  'MUSIC_STARTED',
  'MUSIC_STOPPED',
  'FINAL_PRODUCTION_CONFIRMED',
  'FINAL_PRODUCTION_REVOKED',
  'ANNOUNCEMENT_NOTE',
]);
const scope = z.object({
  competitionId: z.string().uuid(),
  competitionTypeId: z.string().min(1),
  roundName: z.string().min(1),
  phase: z.string().min(1),
});
const entry = scope.extend({
  id: z.string().uuid(),
  action,
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});
const assessment = z.object({
  mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  musicRequired: z.boolean(),
  musicPlaying: z.boolean(),
  musicProgramApproved: z.boolean(),
  finalProductionConfirmed: z.boolean(),
  ready: z.boolean(),
  mayProceed: z.boolean(),
  guidance: z.array(z.string()),
  ruleReferences: z.array(z.string()),
});
const record = scope.extend({
  action,
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

export type ProductionOperationEntryDto = z.infer<typeof entry>;
export type ProductionOperationAssessmentDto = z.infer<typeof assessment>;
export type ProductionOperationScopePayload = z.infer<typeof scope>;
export type RecordProductionOperationPayload = z.infer<typeof record>;

export const productionOperationsContract = defineContract('productionOperations', {
  list: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(z.array(entry))),
  assess: query(scope, queryResponseSchema(assessment)),
  record: command(record, commandDataResponseSchema(entry)),
});
