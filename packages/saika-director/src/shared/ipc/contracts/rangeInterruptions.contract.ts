import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();
const scopeTypeSchema = z.enum(['COMPETITION', 'EVENT']);
const causeSchema = z.enum([
  'ATHLETE_NON_FAULT',
  'ALL_TARGET_FAILURE',
  'SINGLE_TARGET_FAILURE',
  'FIRING_POINT_MOVE',
  'OTHER',
]);
const phaseSchema = z.enum(['SIGHTING', 'MATCH']);
const entryTypeSchema = z.enum([
  'PAUSE_APPLIED',
  'ENDED',
  'TIME_GRANTED',
  'RESUME_APPLIED',
  'MATCH_RESUMED',
  'NOTE',
  'CLOSED',
  'REOPENED',
  'VOID',
]);

const RangeInterruptionScopeDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  scopeType: scopeTypeSchema,
  scopeId: z.string().min(1),
  linkedBy: z.string().min(1),
  note: z.string().min(1).nullable(),
  linkedAt: z.string().datetime(),
});

const RangeInterruptionEntryDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  type: entryTypeSchema,
  occurredAt: z.string().datetime(),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  ruleReference: z.string().min(1).nullable(),
  lostTimeSeconds: z.number().int().nonnegative().nullable(),
  extensionSeconds: z.number().int().nonnegative().nullable(),
  authorizedRemainingSeconds: z.number().int().nonnegative().nullable(),
  unlimitedSightingShots: z.boolean().nullable(),
  incidentReportReference: z.string().min(1).nullable(),
  commandId: z.string().min(1).nullable(),
  recordedAt: z.string().datetime(),
});

const TargetRecoveryAssessmentDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  repairCompletedAt: z.string().datetime().nullable(),
  movedToReserveFiringPoint: z.boolean(),
  reserveFiringPointNumber: z.number().int().positive().nullable(),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  assessedAt: z.string().datetime(),
});

const rangeCommandOperationSchema = z.enum(['PAUSE', 'RESUME', 'MATCH_RESUME']);
const rangeCommandActionSchema = z.enum(['pause-timer', 'resume-timer', 'resume-match']);
const RangeCommandLaneOutcomeDtoSchema = z.object({
  commandId: uuidSchema,
  action: rangeCommandActionSchema,
  laneId: z.string().min(1),
  status: z.enum(['done', 'error', 'timeout']),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  acknowledgedAt: z.string().datetime().nullable(),
});

const RangeInterruptionCommandBatchDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  competitionId: uuidSchema,
  operation: rangeCommandOperationSchema,
  targetLaneIds: z.array(z.string().min(1)).min(1),
  success: z.boolean(),
  outcomes: z.array(RangeCommandLaneOutcomeDtoSchema).min(1),
  officialName: z.string().min(1),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const IssfInterruptionRecommendationDtoSchema = z.object({
  basis: z.enum([
    'MANUAL_REVIEW',
    'LOST_TIME',
    'LAST_FIVE_MINUTES',
    'SIGHTING_AND_FIVE_MINUTES',
    'TARGET_FAILURE_RECOVERY',
  ]),
  lostTimeSeconds: z.number().int().nonnegative(),
  baseRemainingSeconds: z.number().int().nonnegative(),
  suggestedAdditionalSeconds: z.number().int().nonnegative(),
  suggestedAuthorizedRemainingSeconds: z.number().int().nonnegative(),
  unlimitedSightingShots: z.boolean(),
  ruleReferences: z.string().min(1),
  explanation: z.string().min(1),
});

const RangeInterruptionCaseDtoSchema = z.object({
  id: uuidSchema,
  cause: causeSchema,
  phase: phaseSchema,
  startedAt: z.string().datetime(),
  remainingSecondsAtStart: z.number().int().nonnegative(),
  laneId: z.string().min(1).nullable(),
  firingPointNumber: z.number().int().positive().nullable(),
  athleteName: z.string().min(1).nullable(),
  summary: z.string().min(1),
  details: z.string().min(1),
  openedBy: z.string().min(1),
  createdAt: z.string().datetime(),
  scopes: z.array(RangeInterruptionScopeDtoSchema).min(1),
  entries: z.array(RangeInterruptionEntryDtoSchema),
  targetRecoveryAssessments: z.array(TargetRecoveryAssessmentDtoSchema),
  commandBatches: z.array(RangeInterruptionCommandBatchDtoSchema).optional(),
  status: z.enum(['OPEN', 'ENDED', 'GRANTED', 'RESUMED', 'CLOSED', 'VOID']),
  dataHoldActive: z.boolean(),
  recommendation: IssfInterruptionRecommendationDtoSchema.nullable(),
});

const ScopeInputSchema = z.object({
  scopeType: scopeTypeSchema,
  scopeId: z.string().trim().min(1).max(200),
});

const CreateRangeInterruptionCaseInputSchema = z
  .object({
    id: uuidSchema.optional(),
    scopes: z.array(ScopeInputSchema).min(1).max(4),
    cause: causeSchema,
    phase: phaseSchema,
    startedAt: z.string().datetime(),
    remainingSecondsAtStart: z.number().int().nonnegative(),
    laneId: z.string().trim().min(1).max(200).optional(),
    firingPointNumber: z.number().int().positive().optional(),
    athleteName: z.string().trim().min(1).max(300).optional(),
    summary: z.string().trim().min(1).max(300),
    details: z.string().trim().min(1).max(5000),
    openedBy: z.string().trim().min(1).max(200),
  })
  .superRefine((value, context) => {
    const keys = value.scopes.map((scope) => `${scope.scopeType}:${scope.scopeId}`);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', path: ['scopes'], message: 'Scope links must be unique' });
    }
  });

const LinkRangeInterruptionScopeInputSchema = z.object({
  caseId: uuidSchema,
  scope: ScopeInputSchema,
  linkedBy: z.string().trim().min(1).max(200),
  note: z.string().trim().min(1).max(1000).optional(),
});

const RecordTargetRecoveryAssessmentInputSchema = z
  .object({
    id: uuidSchema.optional(),
    caseId: uuidSchema,
    repairCompletedAt: z.string().datetime().optional(),
    movedToReserveFiringPoint: z.boolean(),
    reserveFiringPointNumber: z.number().int().positive().optional(),
    statement: z.string().trim().min(1).max(3000),
    officialName: z.string().trim().min(1).max(200),
    assessedAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.reserveFiringPointNumber !== undefined && !value.movedToReserveFiringPoint) {
      context.addIssue({
        code: 'custom',
        path: ['reserveFiringPointNumber'],
        message: 'A reserve firing point can only be recorded when the athlete moved',
      });
    }
    if (value.movedToReserveFiringPoint && value.reserveFiringPointNumber === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['reserveFiringPointNumber'],
        message: 'Reserve firing point number is required when the athlete moved',
      });
    }
  });

const entryBase = {
  caseId: uuidSchema,
  occurredAt: z.string().datetime(),
  statement: z.string().trim().min(1).max(3000),
  officialName: z.string().trim().min(1).max(200),
};

const commandEntry = (type: 'PAUSE_APPLIED' | 'RESUME_APPLIED' | 'MATCH_RESUMED') =>
  z.object({
    ...entryBase,
    type: z.literal(type),
    commandId: uuidSchema,
    ruleReference: z.string().trim().min(1).max(500).optional(),
  });

const AppendRangeInterruptionEntryInputSchema = z.discriminatedUnion('type', [
  commandEntry('PAUSE_APPLIED'),
  z.object({
    ...entryBase,
    type: z.literal('ENDED'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('TIME_GRANTED'),
    extensionSeconds: z.number().int().nonnegative(),
    authorizedRemainingSeconds: z.number().int().nonnegative(),
    unlimitedSightingShots: z.boolean(),
    incidentReportReference: z.string().trim().min(1).max(500),
    ruleReference: z.string().trim().min(1).max(500),
  }),
  commandEntry('RESUME_APPLIED'),
  commandEntry('MATCH_RESUMED'),
  z.object({
    ...entryBase,
    type: z.literal('NOTE'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('CLOSED'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('REOPENED'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('VOID'),
    ruleReference: z.string().trim().min(1).max(500).optional(),
  }),
]);

const RecordRangeCommandBatchInputSchema = z.object({
  id: uuidSchema.optional(),
  caseId: uuidSchema,
  competitionId: uuidSchema,
  operation: rangeCommandOperationSchema,
  targetLaneIds: z.array(z.string().min(1)).min(1),
  officialName: z.string().trim().min(1).max(200),
  occurredAt: z.string().datetime(),
  commands: z
    .array(
      z.object({
        commandId: uuidSchema,
        action: rangeCommandActionSchema,
        lanes: z
          .array(
            z.object({
              laneId: z.string().min(1),
              status: z.enum(['done', 'error', 'timeout']),
              error: z.object({ code: z.string(), message: z.string() }).optional(),
              acknowledgedAt: z.string().datetime().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

export type RangeInterruptionScopeTypeDto = z.infer<typeof scopeTypeSchema>;
export type RangeInterruptionCauseDto = z.infer<typeof causeSchema>;
export type RangeInterruptionPhaseDto = z.infer<typeof phaseSchema>;
export type RangeInterruptionEntryTypeDto = z.infer<typeof entryTypeSchema>;
export type RangeInterruptionScopeDto = z.infer<typeof RangeInterruptionScopeDtoSchema>;
export type RangeInterruptionEntryDto = z.infer<typeof RangeInterruptionEntryDtoSchema>;
export type TargetRecoveryAssessmentDto = z.infer<typeof TargetRecoveryAssessmentDtoSchema>;
export type RangeInterruptionCommandBatchDto = z.infer<typeof RangeInterruptionCommandBatchDtoSchema>;
export type IssfInterruptionRecommendationDto = z.infer<typeof IssfInterruptionRecommendationDtoSchema>;
export type RangeInterruptionCaseDto = z.infer<typeof RangeInterruptionCaseDtoSchema>;
export type RangeInterruptionScopePayload = z.infer<typeof ScopeInputSchema>;
export type CreateRangeInterruptionCasePayload = z.infer<typeof CreateRangeInterruptionCaseInputSchema>;
export type LinkRangeInterruptionScopePayload = z.infer<typeof LinkRangeInterruptionScopeInputSchema>;
export type AppendRangeInterruptionEntryPayload = z.infer<typeof AppendRangeInterruptionEntryInputSchema>;
export type RecordTargetRecoveryAssessmentPayload = z.infer<typeof RecordTargetRecoveryAssessmentInputSchema>;
export type RecordRangeCommandBatchPayload = z.infer<typeof RecordRangeCommandBatchInputSchema>;

export const rangeInterruptionsContract = defineContract('rangeInterruptions', {
  listAll: query(queryResponseSchema(z.array(RangeInterruptionCaseDtoSchema))),
  listByScope: query(ScopeInputSchema, queryResponseSchema(z.array(RangeInterruptionCaseDtoSchema))),
  getById: query(z.object({ caseId: uuidSchema }), queryResponseSchema(RangeInterruptionCaseDtoSchema)),
  create: command(CreateRangeInterruptionCaseInputSchema, commandDataResponseSchema(RangeInterruptionCaseDtoSchema)),
  linkScope: command(LinkRangeInterruptionScopeInputSchema, commandDataResponseSchema(RangeInterruptionCaseDtoSchema)),
  appendEntry: command(
    AppendRangeInterruptionEntryInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  recordTargetRecovery: command(
    RecordTargetRecoveryAssessmentInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  recordCommandBatch: command(
    RecordRangeCommandBatchInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
});
