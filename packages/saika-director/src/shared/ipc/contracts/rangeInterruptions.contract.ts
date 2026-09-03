import { z } from 'zod';
import {
  QualificationRecoveryFiringAuthorizationSchema,
  QualificationRecoveryShotPayloadSchema,
  QualificationRecoveryStatePayloadSchema,
} from '@/shared/mqtt';

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
  type: z.literal('MATCH_TIME'),
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

const QualificationTimedTargetSeriesRecoveryRecommendationDtoSchema = z.discriminatedUnion('treatment', [
  z.object({
    treatment: z.literal('KEEP_RECORDED_SERIES'),
    shotsToFire: z.literal(0),
    execution: z.null(),
  }),
  z.object({
    treatment: z.literal('ANNUL_AND_REPEAT'),
    shotsToFire: z.number().int().positive(),
    execution: z.object({ mode: z.literal('SAME_TIMED_TARGET_PROGRAM') }),
  }),
  z.object({
    treatment: z.literal('COMPLETE_REMAINING_SHOTS'),
    shotsToFire: z.number().int().nonnegative(),
    execution: z.union([
      z.object({
        mode: z.literal('SECONDS_PER_SHOT'),
        secondsPerShot: z.number().int().positive(),
        totalSeconds: z.number().int().nonnegative(),
      }),
      z.object({ mode: z.literal('FIRST_EXPOSURE_OF_NEXT_SERIES') }),
    ]),
  }),
]);

const QualificationTimedTargetInterruptionRecommendationDtoSchema = z.object({
  type: z.literal('QUALIFICATION_TIMED_TARGET'),
  interruptionSeconds: z.number().int().nonnegative(),
  stageId: z.string().min(1),
  extraSighting: z.object({
    required: z.boolean(),
    shots: z.number().int().nonnegative(),
  }),
  seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendationDtoSchema,
  ruleReferences: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
});

const QualificationTimedTargetContextDtoSchema = z.object({
  competitionTypeId: z.string().min(1),
  rulePack: z
    .object({
      id: z.string().min(1),
      schemaVersion: z.number().int().positive(),
      fingerprintSha256: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable(),
  stageId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  timedTargetProgramId: z.string().min(1),
  seriesShotLimit: z.number().int().positive(),
  recordedShots: z.number().int().nonnegative(),
  seriesComplete: z.boolean(),
  laneSnapshotCapturedAt: z.string().datetime(),
});

const QualificationTimedTargetAuthorizedRecoverySchema = z.object({
  extraSightingSeriesShots: z.number().int().nonnegative(),
  seriesRecovery: QualificationTimedTargetSeriesRecoveryRecommendationDtoSchema,
});

const QualificationTimedTargetRecoveryDecisionDtoSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  supersedesDecisionId: uuidSchema.nullable(),
  recommendation: QualificationTimedTargetInterruptionRecommendationDtoSchema,
  authorizedRecovery: QualificationTimedTargetAuthorizedRecoverySchema,
  followsRecommendation: z.boolean(),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  incidentReportReference: z.string().min(1),
  ruleReference: z.string().min(1),
  decidedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const QualificationRecoveryExecutionEventDtoSchema = z.object({
  id: uuidSchema,
  type: z.enum([
    'START_RESULT',
    'START_ERROR',
    'LANE_STATE',
    'LANE_STATE_REJECTED',
    'SHOT',
    'SHOT_REJECTED',
    'CANCEL_REQUESTED',
    'CANCEL_RESULT',
    'CANCEL_ERROR',
    'ADJUDICATION_REQUESTED',
    'ADJUDICATION_RESULT',
    'ADJUDICATION_ERROR',
  ]),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const QualificationRecoveryExecutionDtoSchema = z.object({
  runId: uuidSchema,
  caseId: uuidSchema,
  decisionId: uuidSchema,
  competitionId: uuidSchema,
  laneId: uuidSchema,
  phase: z.enum(['EXTRA_SIGHTING', 'SERIES_RECOVERY']),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  expectedMatchProgramId: z.string().min(1),
  expectedSeriesShotLimit: z.number().int().positive(),
  expectedRecordedShots: z.number().int().nonnegative(),
  authorization: QualificationRecoveryFiringAuthorizationSchema,
  officialName: z.string().min(1),
  decisionRuleReference: z.string().min(1),
  decidedAt: z.string().datetime(),
  requestedAt: z.string().datetime(),
  status: z.enum([
    'REQUESTED',
    'COMMAND_FAILED',
    'ACCEPTED',
    'RUNNING',
    'CANCELLING',
    'COMPLETED',
    'CANCELLED',
    'ADJUDICATING',
    'ADJUDICATION_FAILED',
    'ADJUDICATED',
  ]),
  latestLaneState: QualificationRecoveryStatePayloadSchema.nullable(),
  shots: z.array(QualificationRecoveryShotPayloadSchema),
  events: z.array(QualificationRecoveryExecutionEventDtoSchema),
});

const QualificationRecoverySettlementEventDtoSchema = z.object({
  id: uuidSchema,
  type: z.enum(['SETTLEMENT_RESULT', 'SETTLEMENT_ERROR']),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const QualificationRecoverySettlementDtoSchema = z.object({
  settlementId: uuidSchema,
  caseId: uuidSchema,
  decisionId: uuidSchema,
  competitionId: uuidSchema,
  laneId: uuidSchema,
  treatment: z.literal('KEEP_RECORDED_SERIES'),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  expectedMatchProgramId: z.string().min(1),
  expectedSeriesShotLimit: z.number().int().positive(),
  expectedRecordedShots: z.number().int().nonnegative(),
  decisionOfficialName: z.string().min(1),
  decisionRuleReference: z.string().min(1),
  decidedAt: z.string().datetime(),
  appliedBy: z.string().min(1),
  statement: z.string().min(1),
  appliedAt: z.string().datetime(),
  requestedAt: z.string().datetime(),
  status: z.enum(['REQUESTED', 'COMMAND_FAILED', 'APPLIED']),
  events: z.array(QualificationRecoverySettlementEventDtoSchema),
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
  qualificationTimedTargetContext: QualificationTimedTargetContextDtoSchema.nullable(),
  qualificationTimedTargetRecoveryDecisions: z.array(QualificationTimedTargetRecoveryDecisionDtoSchema),
  qualificationRecoveryExecutions: z.array(QualificationRecoveryExecutionDtoSchema),
  qualificationRecoverySettlements: z.array(QualificationRecoverySettlementDtoSchema),
  status: z.enum(['OPEN', 'ENDED', 'GRANTED', 'RESUMED', 'CLOSED', 'VOID']),
  dataHoldActive: z.boolean(),
  recommendation: z
    .union([IssfInterruptionRecommendationDtoSchema, QualificationTimedTargetInterruptionRecommendationDtoSchema])
    .nullable(),
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
    qualificationTimedTargetContext: z
      .object({
        competitionTypeId: z.string().trim().min(1).max(200),
        stageIndex: z.number().int().nonnegative(),
        seriesIndex: z.number().int().nonnegative(),
        recordedShots: z.number().int().nonnegative(),
        seriesComplete: z.boolean(),
        laneSnapshotCapturedAt: z.string().datetime(),
      })
      .optional(),
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

const RecordQualificationTimedTargetRecoveryDecisionInputSchema = z.object({
  id: uuidSchema.optional(),
  caseId: uuidSchema,
  supersedesDecisionId: uuidSchema.optional(),
  authorizedRecovery: QualificationTimedTargetAuthorizedRecoverySchema,
  statement: z.string().trim().min(1).max(3000),
  officialName: z.string().trim().min(1).max(200),
  incidentReportReference: z.string().trim().min(1).max(500),
  ruleReference: z.string().trim().min(1).max(500),
  decidedAt: z.string().datetime().optional(),
});

const StartQualificationRecoveryExecutionInputSchema = z.object({
  caseId: uuidSchema,
  decisionId: uuidSchema,
  competitionId: uuidSchema,
  phase: z.enum(['EXTRA_SIGHTING', 'SERIES_RECOVERY']),
});

const CancelQualificationRecoveryExecutionInputSchema = z.object({
  caseId: uuidSchema,
  runId: uuidSchema,
  reason: z.string().trim().min(1).max(500),
});

const AdjudicateQualificationRecoveryExecutionInputSchema = z.object({
  caseId: uuidSchema,
  runId: uuidSchema,
  appliedBy: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(1_000),
});

const ApplyQualificationRecoverySettlementInputSchema = z.object({
  caseId: uuidSchema,
  decisionId: uuidSchema,
  competitionId: uuidSchema,
  appliedBy: z.string().trim().min(1).max(200),
  statement: z.string().trim().min(1).max(1_000),
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
export type QualificationTimedTargetInterruptionRecommendationDto = z.infer<
  typeof QualificationTimedTargetInterruptionRecommendationDtoSchema
>;
export type QualificationTimedTargetContextDto = z.infer<typeof QualificationTimedTargetContextDtoSchema>;
export type QualificationTimedTargetRecoveryDecisionDto = z.infer<
  typeof QualificationTimedTargetRecoveryDecisionDtoSchema
>;
export type QualificationRecoveryExecutionDto = z.infer<typeof QualificationRecoveryExecutionDtoSchema>;
export type QualificationRecoverySettlementDto = z.infer<typeof QualificationRecoverySettlementDtoSchema>;
export type StartQualificationRecoveryExecutionPayload = z.infer<typeof StartQualificationRecoveryExecutionInputSchema>;
export type CancelQualificationRecoveryExecutionPayload = z.infer<
  typeof CancelQualificationRecoveryExecutionInputSchema
>;
export type AdjudicateQualificationRecoveryExecutionPayload = z.infer<
  typeof AdjudicateQualificationRecoveryExecutionInputSchema
>;
export type ApplyQualificationRecoverySettlementPayload = z.infer<
  typeof ApplyQualificationRecoverySettlementInputSchema
>;
export type RangeInterruptionCaseDto = z.infer<typeof RangeInterruptionCaseDtoSchema>;
export type RangeInterruptionScopePayload = z.infer<typeof ScopeInputSchema>;
export type CreateRangeInterruptionCasePayload = z.infer<typeof CreateRangeInterruptionCaseInputSchema>;
export type LinkRangeInterruptionScopePayload = z.infer<typeof LinkRangeInterruptionScopeInputSchema>;
export type AppendRangeInterruptionEntryPayload = z.infer<typeof AppendRangeInterruptionEntryInputSchema>;
export type RecordTargetRecoveryAssessmentPayload = z.infer<typeof RecordTargetRecoveryAssessmentInputSchema>;
export type RecordRangeCommandBatchPayload = z.infer<typeof RecordRangeCommandBatchInputSchema>;
export type RecordQualificationTimedTargetRecoveryDecisionPayload = z.infer<
  typeof RecordQualificationTimedTargetRecoveryDecisionInputSchema
>;

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
  recordQualificationTimedTargetRecoveryDecision: command(
    RecordQualificationTimedTargetRecoveryDecisionInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  startQualificationRecoveryExecution: command(
    StartQualificationRecoveryExecutionInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  cancelQualificationRecoveryExecution: command(
    CancelQualificationRecoveryExecutionInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  adjudicateQualificationRecoveryExecution: command(
    AdjudicateQualificationRecoveryExecutionInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
  applyQualificationRecoverySettlement: command(
    ApplyQualificationRecoverySettlementInputSchema,
    commandDataResponseSchema(RangeInterruptionCaseDtoSchema),
  ),
});
