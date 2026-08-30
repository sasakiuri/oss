import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const commandTarget = z.object({
  stageId: z.string().min(1),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
});

const commandTiming = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('SCHEDULED_START_OFFSET'), offsetSeconds: z.number().int().nonpositive() }),
  z.object({ mode: z.literal('AFTER_PREVIOUS'), delaySeconds: z.number().int().nonnegative() }),
  z.object({
    mode: z.literal('TIME_OR_ALL_SHOTS'),
    durationSeconds: z.number().int().positive(),
    shotsPerParticipant: z.number().int().positive(),
  }),
  z.object({ mode: z.literal('MANUAL') }),
]);

const firingPurpose = z.enum(['SIGHTING', 'MATCH', 'SHOOT_OFF']);
const participantSelection = z.enum(['ALL_ACTIVE', 'TIED_ONLY']);
const commandEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('NONE') }),
  z.object({
    type: z.literal('LOAD'),
    purpose: firingPurpose,
    participantSelection,
    target: commandTarget.optional(),
  }),
  z.object({
    type: z.literal('OPEN_FIRING'),
    purpose: firingPurpose,
    participantSelection,
    durationSeconds: z.number().int().positive(),
    shotsPerParticipant: z.number().int().positive().optional(),
    target: commandTarget.optional(),
  }),
  z.object({ type: z.literal('CLOSE_FIRING'), purpose: firingPurpose, target: commandTarget.optional() }),
  z.object({ type: z.literal('CHECKPOINT'), afterMatchShot: z.number().int().positive().optional() }),
  z.object({ type: z.literal('DECLARE_RESULTS') }),
]);

export const FinalOperationScriptStepDtoSchema = z.object({
  id: z.string().min(1),
  actor: z.enum(['OFFICIAL', 'CRO', 'ANNOUNCER']),
  kind: z.enum(['CHECK', 'COMMAND', 'ANNOUNCEMENT', 'DECLARATION']),
  text: z.string().min(1),
  ruleReference: z.string().min(1),
  timing: commandTiming,
  effect: commandEffect,
});

const executionAttempt = z.object({
  id: z.string().uuid(),
  status: z.enum(['DONE', 'ERROR', 'TIMEOUT']),
  commandId: z.string().uuid().nullable(),
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});

const stepProjection = z.object({
  step: FinalOperationScriptStepDtoSchema,
  status: z.enum(['PENDING', 'AWAITING_CONFIRMATION', 'AWAITING_EXECUTION', 'COMPLETED', 'SKIPPED']),
  confirmationEntryId: z.string().uuid().nullable(),
  eligibleLaneIds: z.array(z.string().uuid()),
  executionAttempts: z.array(executionAttempt),
  scheduledFor: z.string().datetime().nullable(),
});

const entry = z.object({
  id: z.string().uuid(),
  entryType: z.enum([
    'STEP_CONFIRMED',
    'STEP_SKIPPED',
    'EXECUTION_RESULT',
    'SHOOT_OFF_STARTED',
    'SHOOT_OFF_ROUND_CLOSED',
    'ABORTED',
  ]),
  branch: z.enum(['MAIN', 'SHOOT_OFF']),
  iteration: z.number().int().nonnegative(),
  stepId: z.string().nullable(),
  confirmationEntryId: z.string().uuid().nullable(),
  executionStatus: z.enum(['DONE', 'ERROR', 'TIMEOUT']).nullable(),
  commandId: z.string().uuid().nullable(),
  eligibleLaneIds: z.array(z.string().uuid()),
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

const shootOffShot = z.object({
  id: z.string().uuid(),
  iteration: z.number().int().positive(),
  laneId: z.string().uuid(),
  shotId: z.string().uuid(),
  scoreX10: z.number().int().min(0).max(109),
  x: z.number().nullable(),
  y: z.number().nullable(),
  firedAt: z.string().datetime(),
  observedAt: z.string().datetime(),
});

const shootOffUnit = z.object({
  unitId: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(300),
  laneIds: z
    .array(z.string().uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'Shoot-off unit Lane IDs must be unique'),
});

const shootOffProjection = z.object({
  iteration: z.number().int().positive(),
  checkpointStepId: z.string().min(1),
  eligibleLaneIds: z.array(z.string().uuid()).min(2),
  units: z.array(shootOffUnit).min(2),
  status: z.enum(['ACTIVE', 'AWAITING_RESOLUTION']),
  steps: z.array(stepProjection),
  currentStep: stepProjection.nullable(),
  shots: z.array(shootOffShot),
});

const run = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  competitionTypeId: z.string().min(1),
  rulePackId: z.string().min(1),
  scriptVersion: z.string().min(1),
  scheduledStartAt: z.string().datetime(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']),
  currentBranch: z.enum(['MAIN', 'SHOOT_OFF']),
  currentStep: stepProjection.nullable(),
  steps: z.array(stepProjection),
  shootOff: shootOffProjection.nullable(),
  shootOffShots: z.array(shootOffShot),
  entries: z.array(entry),
});

const createRun = z.object({
  competitionId: z.string().uuid(),
  eventId: z.string().uuid().optional(),
  competitionTypeId: z.string().min(1),
  scheduledStartAt: z.string().datetime(),
  officialName: z.string().trim().min(1).max(200),
});

const confirmStep = z.object({
  runId: z.string().uuid(),
  stepId: z.string().min(1),
  eligibleLaneIds: z.array(z.string().uuid()).optional(),
  statement: z.string().trim().max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const recordExecution = z.object({
  runId: z.string().uuid(),
  confirmationEntryId: z.string().uuid(),
  status: z.enum(['DONE', 'ERROR', 'TIMEOUT']),
  commandId: z.string().uuid().optional(),
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const skipStep = z.object({
  runId: z.string().uuid(),
  stepId: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const abortRun = z.object({
  runId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const startShootOff = z
  .object({
    runId: z.string().uuid(),
    checkpointStepId: z.string().min(1),
    eligibleLaneIds: z
      .array(z.string().uuid())
      .min(2)
      .refine((ids) => new Set(ids).size === ids.length),
    /** Optional for backward-compatible individual Finals; Mixed Team Finals require explicit two-Lane units. */
    units: z.array(shootOffUnit).min(2).max(100).optional(),
    reason: z.string().trim().min(1).max(2000),
    officialName: z.string().trim().min(1).max(200),
    recordedAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (!value.units) return;
    if (new Set(value.units.map((unit) => unit.unitId)).size !== value.units.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['units'], message: 'Shoot-off unit IDs must be unique' });
    }
    const unitLaneIds = value.units.flatMap((unit) => unit.laneIds);
    if (new Set(unitLaneIds).size !== unitLaneIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['units'],
        message: 'A Lane may belong to only one shoot-off unit',
      });
    }
    if (
      unitLaneIds.length !== value.eligibleLaneIds.length ||
      unitLaneIds.some((laneId) => !value.eligibleLaneIds.includes(laneId))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['units'],
        message: 'Shoot-off units must cover every eligible Lane exactly once',
      });
    }
  });

const closeShootOffRound = z.object({
  runId: z.string().uuid(),
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

export type FinalOperationScriptStepDto = z.infer<typeof FinalOperationScriptStepDtoSchema>;
export type FinalOperationRunDto = z.infer<typeof run>;
export type CreateFinalOperationRunPayload = z.infer<typeof createRun>;
export type ConfirmFinalOperationStepPayload = z.infer<typeof confirmStep>;
export type RecordFinalOperationExecutionPayload = z.infer<typeof recordExecution>;
export type SkipFinalOperationStepPayload = z.infer<typeof skipStep>;
export type AbortFinalOperationRunPayload = z.infer<typeof abortRun>;
export type StartFinalOperationShootOffPayload = z.infer<typeof startShootOff>;
export type CloseFinalOperationShootOffRoundPayload = z.infer<typeof closeShootOffRound>;

export const finalOperationsContract = defineContract('finalOperations', {
  getByCompetition: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(run.nullable())),
  create: command(createRun, commandDataResponseSchema(run)),
  confirmStep: command(confirmStep, commandDataResponseSchema(run)),
  recordExecution: command(recordExecution, commandDataResponseSchema(run)),
  skipStep: command(skipStep, commandDataResponseSchema(run)),
  abort: command(abortRun, commandDataResponseSchema(run)),
  startShootOff: command(startShootOff, commandDataResponseSchema(run)),
  closeShootOffRound: command(closeShootOffRound, commandDataResponseSchema(run)),
});
