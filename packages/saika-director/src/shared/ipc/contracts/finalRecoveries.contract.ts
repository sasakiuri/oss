import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const procedureProfile = z.enum([
  'RIFLE_PISTOL_10M_50M',
  'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
  'PISTOL_25M_RAPID_FIRE',
  'PISTOL_25M_WOMEN',
  'GENERAL',
]);
const incidentType = z.enum(['MALFUNCTION', 'EST_FAILURE', 'INCORRECT_COMMAND', 'IRREGULAR_CASE']);
const phase = z.enum(['SIGHTING', 'MATCH_SINGLE', 'MATCH_SERIES', 'SHOOT_OFF', 'OTHER']);
const entryType = z.enum(['NOTE', 'STOP_RECORDED', 'JURY_RULING', 'REMEDY_AUTHORIZED', 'RESUMED', 'COMPLETED', 'VOID']);
const classification = z.enum([
  'ALLOWABLE_MALFUNCTION',
  'NON_ALLOWABLE_MALFUNCTION',
  'TARGET_MALFUNCTION',
  'SHOT_CONFIRMED_MISS',
  'COMMAND_CONFIRMED',
  'COMMAND_NOT_CONFIRMED',
  'OTHER',
]);
const remedy = z.enum([
  'NONE',
  'FIRE_TEST_SHOT',
  'REPEAT_SINGLE_SHOT',
  'COMPLETE_SERIES',
  'REPEAT_SERIES',
  'COUNT_DISPLAYED_SHOTS',
  'MOVE_TO_RESERVE_TARGET',
  'RESTART_PREPARATION_AND_SIGHTING',
  'GRANT_TWO_MINUTE_SIGHTING',
  'RESET_TO_ORIGINAL_TIME',
  'RESTART_WITH_REMAINING_TIME_PLUS_60',
  'NULLIFY_EXTRA_SHOTS_WITHOUT_PENALTY',
  'APPLY_RULE_PENALTY',
  'CONTINUE',
  'OTHER',
]);

const entry = z.object({
  id: uuid,
  caseId: uuid,
  type: entryType,
  statement: z.string().min(1),
  officialName: z.string().min(1),
  ruleReference: z.string().min(1).nullable(),
  classification: classification.nullable(),
  remedy: remedy.nullable(),
  remainingTimeSeconds: z.number().int().nonnegative().nullable(),
  grantedTimeSeconds: z.number().int().nonnegative().nullable(),
  shotCount: z.number().int().nonnegative().nullable(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const guidance = z.object({
  ruleReferences: z.array(z.string().min(1)).min(1),
  checklist: z.array(z.string().min(1)).min(1),
  classifications: z.array(classification),
  remedies: z.array(remedy),
  limits: z.object({
    malfunctionAllowancePerFinal: z.number().int().positive().nullable(),
    repairLimitSeconds: z.number().int().positive().nullable(),
    readyLimitSeconds: z.number().int().positive().nullable(),
    incorrectCommandAdditionalSeconds: z.number().int().positive().nullable(),
    longDelayThresholdSeconds: z.number().int().positive().nullable(),
    sightingTimeSeconds: z.number().int().positive().nullable(),
  }),
});

const recoveryCase = z.object({
  id: uuid,
  competitionId: uuid,
  eventId: uuid.nullable(),
  finalRunId: uuid.nullable(),
  scriptStepId: z.string().min(1).nullable(),
  scriptStepSnapshot: z.string().min(1).nullable(),
  procedureProfile,
  incidentType,
  phase,
  affectedLaneIds: z.array(uuid),
  summary: z.string().min(1),
  openedBy: z.string().min(1),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  status: z.enum(['OPEN', 'STOPPED', 'RULING_RECORDED', 'RECOVERY_AUTHORIZED', 'RESUMED', 'COMPLETED', 'VOID']),
  guidance,
  entries: z.array(entry),
});

const create = z.object({
  competitionId: uuid,
  eventId: uuid.optional(),
  finalRunId: uuid.optional(),
  scriptStepId: z.string().trim().min(1).max(300).optional(),
  scriptStepSnapshot: z.string().trim().min(1).max(2000).optional(),
  procedureProfile,
  incidentType,
  phase,
  affectedLaneIds: z
    .array(uuid)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Affected Lane IDs must be unique'),
  summary: z.string().trim().min(1).max(5000),
  openedBy: z.string().trim().min(1).max(200),
  occurredAt: z.string().datetime().optional(),
});

const appendEntry = z
  .object({
    caseId: uuid,
    type: entryType,
    statement: z.string().trim().min(1).max(5000),
    officialName: z.string().trim().min(1).max(200),
    ruleReference: z.string().trim().min(1).max(500).optional(),
    classification: classification.optional(),
    remedy: remedy.optional(),
    remainingTimeSeconds: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 60 * 60)
      .optional(),
    grantedTimeSeconds: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 60 * 60)
      .optional(),
    shotCount: z.number().int().nonnegative().max(1000).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'JURY_RULING' && !value.classification) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classification'],
        message: 'A Jury ruling requires a classification',
      });
    }
    if (value.type === 'REMEDY_AUTHORIZED' && !value.remedy) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remedy'],
        message: 'A recovery authorization requires a remedy',
      });
    }
  });

export type FinalRecoveryProcedureProfileDto = z.infer<typeof procedureProfile>;
export type FinalRecoveryIncidentTypeDto = z.infer<typeof incidentType>;
export type FinalRecoveryPhaseDto = z.infer<typeof phase>;
export type FinalRecoveryEntryTypeDto = z.infer<typeof entryType>;
export type FinalRecoveryClassificationDto = z.infer<typeof classification>;
export type FinalRecoveryRemedyDto = z.infer<typeof remedy>;
export type FinalRecoveryGuidanceDto = z.infer<typeof guidance>;
export type FinalRecoveryCaseDto = z.infer<typeof recoveryCase>;
export type CreateFinalRecoveryCasePayload = z.infer<typeof create>;
export type AppendFinalRecoveryEntryPayload = z.infer<typeof appendEntry>;

export const finalRecoveriesContract = defineContract('finalRecoveries', {
  listByCompetition: query(z.object({ competitionId: uuid }), queryResponseSchema(z.array(recoveryCase))),
  listByEvent: query(z.object({ eventId: uuid }), queryResponseSchema(z.array(recoveryCase))),
  create: command(create, commandDataResponseSchema(recoveryCase)),
  appendEntry: command(appendEntry, commandDataResponseSchema(recoveryCase)),
});
