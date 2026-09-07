import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const reportSource = z.enum(['LANE_SIGNAL', 'DIRECTOR_MANUAL']);
const claimMode = z.enum(['CLAIM', 'DOCUMENTATION_ONLY']);
const officialRole = z.enum(['RANGE_OFFICER', 'CRO', 'JURY_MEMBER', 'RTS_OFFICER', 'TECHNICAL_OFFICER']);
const entryType = z.enum([
  'NOTE',
  'INSPECTION_RECORDED',
  'CLASSIFIED',
  'REPAIR_STARTED',
  'REPAIR_EXTENDED',
  'REPAIR_COMPLETED',
  'REMEDY_AUTHORIZED',
  'EXECUTION_RECORDED',
  'SCORE_SETTLED',
  'SCORE_REOPENED',
  'COMPLETED',
  'VOID',
]);
const classification = z.enum(['ALLOWABLE', 'NON_ALLOWABLE']);
const remedy = z.enum([
  'CONTINUE_WITHIN_ORIGINAL_TIME',
  'REPEAT_FULL_SERIES',
  'COMPLETE_REMAINING_SHOTS',
  'SCORE_UNFIRED_AS_MISS',
  'NO_FURTHER_ACTION',
]);
const status = z.enum([
  'OPEN',
  'INSPECTED',
  'CLASSIFIED',
  'REPAIRING',
  'REPAIRED',
  'RECOVERY_AUTHORIZED',
  'EXECUTED',
  'SETTLED',
  'COMPLETED',
  'VOID',
]);
const rulePackIdentity = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  fingerprint: z.object({ algorithm: z.literal('SHA-256'), value: z.string().regex(/^[a-f0-9]{64}$/) }),
});
const causeRule = z.object({
  code: z.string().min(1),
  classification,
  label: z.string().min(1),
  ruleReference: z.string().min(1),
});
const claimLimit = z.object({
  sightingClaims: z.literal('PROHIBITED'),
  maximum: z.number().int().positive(),
  scope: z.enum(['EACH_30_SHOT_STAGE', 'SIXTY_SHOT_MATCH']),
  exceptionalTwoPartMaximumPerPart: z.number().int().positive().optional(),
});
const replacement = z.object({
  sameTypeAndCalibreRequired: z.literal(true),
  sameMechanismRequired: z.literal(true).optional(),
  targetedTestingRequired: z.literal(true),
});
const additionalSighting = z.discriminatedUnion('policy', [
  z.object({ policy: z.literal('JURY_MAY_ALLOW'), shots: z.null() }),
  z.object({ policy: z.literal('JURY_MUST_ALLOW_SERIES'), shots: z.number().int().positive() }),
]);
const repeatTreatment = z.object({
  type: z.literal('REPEAT_FULL_SERIES'),
  shots: z.number().int().positive(),
  scoreCombination: z.enum(['LOWEST_PER_TARGET', 'LOWEST_OVERALL']),
  scoreCount: z.number().int().positive(),
  secondMalfunction: z.literal('ZERO_FILL_ROW_WITH_MOST_RECORDED_SHOTS'),
  incidentForm: z.enum(['RFPM', 'STDP']),
});
const completionTreatment = z.object({
  type: z.literal('COMPLETE_REMAINING_SHOTS'),
  execution: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('SECONDS_PER_SHOT'), secondsPerShot: z.number().int().positive() }),
    z.object({ mode: z.literal('FIRST_EXPOSURE_OF_NEXT_SERIES') }),
  ]),
  scoreCombination: z.literal('NORMAL_SERIES'),
  incidentForm: z.literal('IR'),
});
const allowableTreatment = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CONTINUE_WITHIN_ORIGINAL_TIME') }),
  repeatTreatment,
  completionTreatment,
]);
const policySnapshot = z.object({
  determinationAuthority: z.enum(['RANGE_OFFICER', 'RANGE_OR_JURY_OFFICIAL']),
  causes: z.array(causeRule).min(1),
  claimLimit: claimLimit.optional(),
  repair: z.object({
    maximumSeconds: z.number().int().positive().nullable(),
    juryMayExtend: z.boolean(),
    completionScheduling: z.enum(['WITHIN_ORIGINAL_COMPETITION_TIME', 'JURY_DETERMINED_TIME_AND_PLACE']),
    replacement,
    additionalSighting,
    ruleReferences: z.array(z.string().min(1)).min(1),
  }),
  nonAllowableTreatment: z.object({
    unfiredShots: z.literal('MISS'),
    refirePermitted: z.literal(false),
    completionPermitted: z.literal(false),
    ruleReference: z.string().min(1),
  }),
  stages: z
    .array(
      z.object({
        stageId: z.string().min(1),
        allowableTreatment,
        ruleReference: z.string().min(1),
      }),
    )
    .min(1),
  documentation: z.object({
    incidentRecords: z.array(z.enum(['RANGE_INCIDENT_REPORT', 'RFPM', 'STDP'])).min(1),
    selection: z.enum(['ONE_OF', 'REQUIRED_FORM']),
    rangeRegisterRequired: z.literal(true),
    ruleReferences: z.array(z.string().min(1)).min(1),
  }),
  ruleReferences: z.array(z.string().min(1)).min(1),
});
const claimAssessment = z.object({
  allowed: z.boolean(),
  maximumInScope: z.number().int().positive().nullable(),
  maximumInExceptionalPart: z.number().int().positive().nullable(),
  reason: z.enum([
    'NO_NUMERIC_LIMIT',
    'SIGHTING_CLAIM_PROHIBITED',
    'AVAILABLE',
    'SCOPE_LIMIT_REACHED',
    'PART_LIMIT_REACHED',
  ]),
});
const entry = z.object({
  id: uuid,
  caseId: uuid,
  type: entryType,
  statement: z.string().min(1),
  officialName: z.string().min(1),
  officialRole,
  ruleReference: z.string().min(1).nullable(),
  classification: classification.nullable(),
  causeCode: z.string().min(1).nullable(),
  remedy: remedy.nullable(),
  shotsToFire: z.number().int().nonnegative().nullable(),
  repairSeconds: z.number().int().positive().nullable(),
  artifactId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});
const malfunctionCase = z.object({
  id: uuid,
  competitionId: uuid,
  eventId: uuid,
  competitionTypeId: z.string().min(1),
  rulePackIdentity: rulePackIdentity.nullable(),
  policySnapshot,
  participantId: uuid,
  participantNameSnapshot: z.string().min(1),
  startNumberSnapshot: z.string().min(1).nullable(),
  laneId: uuid,
  laneChannelSnapshot: z.number().int().positive(),
  relayNumberSnapshot: z.number().int().positive(),
  reportSource,
  sourceSignalId: uuid.nullable(),
  claimMode,
  phase: z.enum(['SIGHTING', 'MATCH']),
  stageId: z.string().min(1).nullable(),
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  seriesShotLimit: z.number().int().positive().nullable(),
  recordedShots: z.number().int().nonnegative(),
  timedTargetProgramId: z.string().min(1).nullable(),
  exposureIndex: z.number().int().nonnegative().nullable(),
  laneSessionId: z.string().min(1).nullable(),
  laneSnapshotCapturedAt: z.string().datetime().nullable(),
  exceptionalMatchPart: z.union([z.literal(1), z.literal(2)]).nullable(),
  existingClaimsInScope: z.number().int().nonnegative(),
  existingClaimsInPart: z.number().int().nonnegative().nullable(),
  claimAssessment,
  summary: z.string().min(1),
  openedBy: z.string().min(1),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  status,
  entries: z.array(entry),
});

const create = z
  .object({
    competitionId: uuid,
    eventId: uuid,
    participantId: uuid,
    laneId: uuid,
    laneChannel: z.number().int().positive().max(65535),
    relayNumber: z.number().int().positive().max(10000),
    reportSource,
    sourceSignalId: uuid.optional(),
    claimMode,
    stageIndex: z.number().int().nonnegative().max(1000),
    seriesIndex: z.number().int().nonnegative().max(1000),
    recordedShots: z.number().int().nonnegative().max(1000),
    exposureIndex: z.number().int().nonnegative().max(1000).optional(),
    laneSessionId: z.string().trim().min(1).max(200).optional(),
    exceptionalMatchPart: z.union([z.literal(1), z.literal(2)]).optional(),
    summary: z.string().trim().min(1).max(5000),
    openedBy: z.string().trim().min(1).max(200),
    occurredAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.reportSource === 'LANE_SIGNAL' && !value.sourceSignalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceSignalId'],
        message: 'A Lane signal case requires sourceSignalId',
      });
    }
    if (value.reportSource === 'DIRECTOR_MANUAL' && value.sourceSignalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceSignalId'],
        message: 'A manual case must not include sourceSignalId',
      });
    }
  });

const appendEntry = z
  .object({
    caseId: uuid,
    type: entryType,
    statement: z.string().trim().min(1).max(5000),
    officialName: z.string().trim().min(1).max(200),
    officialRole,
    ruleReference: z.string().trim().min(1).max(500).optional(),
    classification: classification.optional(),
    causeCode: z.string().trim().min(1).max(200).optional(),
    remedy: remedy.optional(),
    shotsToFire: z.number().int().nonnegative().max(1000).optional(),
    repairSeconds: z
      .number()
      .int()
      .positive()
      .max(24 * 60 * 60)
      .optional(),
    artifactId: z.string().trim().min(1).max(500).optional(),
    occurredAt: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'CLASSIFIED' && (!value.classification || !value.causeCode)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['classification'],
        message: 'A classification entry requires classification and causeCode',
      });
    }
    if (value.type === 'REMEDY_AUTHORIZED' && (!value.remedy || value.shotsToFire === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['remedy'],
        message: 'A remedy authorization requires remedy and shotsToFire',
      });
    }
    if (value.type === 'REPAIR_EXTENDED' && value.repairSeconds === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repairSeconds'],
        message: 'A repair extension requires repairSeconds',
      });
    }
  });

export type QualificationMalfunctionCaseDto = z.infer<typeof malfunctionCase>;
export type QualificationMalfunctionEntryDto = z.infer<typeof entry>;
export type CreateQualificationMalfunctionCasePayload = z.infer<typeof create>;
export type AppendQualificationMalfunctionEntryPayload = z.infer<typeof appendEntry>;

const scoreEvidence = z.object({
  shotId: z.string().trim().min(1).max(200),
  scoreX10: z.number().int().min(0).max(100).multipleOf(10),
  targetIndex: z.number().int().min(0).max(4).optional(),
  evidenceReference: z.string().trim().min(1).max(1000),
  outcome: z.enum(['HIT', 'MISS', 'LATE', 'UNFIRED']),
});
export const MalfunctionScoreSheetInputSchema = z.object({
  caseId: uuid,
  original: z.array(scoreEvidence).max(5),
  recovery: z.array(scoreEvidence).max(5),
  secondMalfunction: z
    .object({
      zeroFillRow: z.enum(['ORIGINAL', 'REPEAT']),
      evidenceReference: z.string().trim().min(1).max(1000),
    })
    .optional(),
  officialName: z.string().trim().min(1).max(200),
  officialRole: z.enum(['RTS_OFFICER', 'JURY_MEMBER']),
  statement: z.string().trim().min(1).max(2000),
});
const countedShot = z.object({
  row: z.enum(['ORIGINAL', 'REPEAT']),
  shotId: z.string().nullable(),
  scoreX10: z.number().int(),
  targetIndex: z.number().int().nullable(),
  addedZero: z.boolean(),
});
const scoreCalculation = z.object({
  form: z.enum(['RFPM', 'STDP', 'IR']),
  ruleReference: z.string(),
  authorizationId: uuid,
  executionEntryId: uuid,
  executionArtifactId: z.string(),
  combination: z.enum(['LOWEST_PER_TARGET', 'LOWEST_OVERALL', 'NORMAL_SERIES']),
  countedShots: z.array(countedShot),
  discardedShotIds: z.array(z.string()),
  addedZeros: z.array(countedShot),
  totalX10: z.number().int().nonnegative(),
});
const scoreSheetPreview = z.object({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  input: MalfunctionScoreSheetInputSchema,
  calculation: scoreCalculation,
  context: z.object({
    competitionId: uuid,
    eventId: uuid,
    participantId: z.string(),
    athleteName: z.string(),
    startNumber: z.string().nullable(),
    laneId: z.string(),
    laneChannel: z.number().int(),
    stageIndex: z.number().int(),
    seriesIndex: z.number().int(),
    rulePackIdentity: rulePackIdentity.nullable(),
  }),
});
const scoreSheet = scoreSheetPreview.extend({
  id: uuid,
  version: z.number().int().positive(),
  recordedAt: z.string().datetime(),
});
const scoreSheetExport = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CANCELLED') }),
  z.object({ status: z.literal('COMPLETED'), path: z.string(), sha256: z.string(), sizeBytes: z.number().int() }),
]);
export type MalfunctionScoreSheetInputDto = z.infer<typeof MalfunctionScoreSheetInputSchema>;
export type MalfunctionScoreSheetPreviewDto = z.infer<typeof scoreSheetPreview>;
export type MalfunctionScoreSheetDto = z.infer<typeof scoreSheet>;

export const qualificationMalfunctionsContract = defineContract('qualificationMalfunctions', {
  previewScoreSheet: query(MalfunctionScoreSheetInputSchema, queryResponseSchema(scoreSheetPreview)),
  saveScoreSheet: command(
    z.object({
      id: uuid,
      expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
      input: MalfunctionScoreSheetInputSchema,
    }),
    commandDataResponseSchema(scoreSheet),
  ),
  listScoreSheets: query(z.object({ caseId: uuid }), queryResponseSchema(z.array(scoreSheet))),
  exportScoreSheet: command(z.object({ id: uuid }), commandDataResponseSchema(scoreSheetExport)),
  listByCompetition: query(z.object({ competitionId: uuid }), queryResponseSchema(z.array(malfunctionCase))),
  listByEvent: query(z.object({ eventId: uuid }), queryResponseSchema(z.array(malfunctionCase))),
  getById: query(z.object({ caseId: uuid }), queryResponseSchema(malfunctionCase)),
  create: command(create, commandDataResponseSchema(malfunctionCase)),
  appendEntry: command(appendEntry, commandDataResponseSchema(malfunctionCase)),
});
