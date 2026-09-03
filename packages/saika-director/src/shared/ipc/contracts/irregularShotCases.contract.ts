import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const resultScope = z.enum(['QUALIFICATION', 'FINAL']);
const kind = z.enum([
  'EXCESS_SHOTS',
  'CROSS_FIRE',
  'DISPUTED_SHOT',
  'LATE_OR_UNFIRED_SHOT',
  'MULTIPLE_SHOTS_SAME_TARGET',
  'READY_POSITION',
]);
const evidenceRelation = z.enum(['SUBJECT', 'POSSIBLE_SOURCE', 'RECIPIENT', 'CONTEXT']);
const entryType = z.enum(['NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID']);
const resolutionCode = z.enum([
  'EXCESS_IDENTIFIED',
  'EXCESS_UNIDENTIFIED',
  'CROSS_FIRE_CONFIRMED',
  'RECEIVED_CROSS_FIRE_CONFIRMED',
  'SHOT_ANNULLED',
  'SHOT_CREDITED',
  'HIT_PENALTY_APPLIED',
  'DISQUALIFICATION_APPLIED',
  'NO_SCORE_CHANGE',
]);

const timelineObservation = z.object({
  observationId: uuid,
  shotId: uuid,
  laneId: uuid,
  sessionId: uuid,
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  shotNumberInSeries: z.number().int().positive(),
  mode: z.enum(['SIGHTING', 'MATCH']),
  effectiveScoreX10: z.number().int().nonnegative(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  scored: z.boolean(),
  isRecorded: z.boolean(),
  isReplay: z.boolean(),
});

const evidence = z.object({
  id: uuid,
  caseId: uuid,
  relation: evidenceRelation,
  observationId: uuid,
  shotId: uuid,
  laneId: uuid,
  sessionId: uuid,
  stageIndex: z.number().int().nonnegative(),
  seriesIndex: z.number().int().nonnegative(),
  shotNumberInSeries: z.number().int().positive(),
  mode: z.enum(['SIGHTING', 'MATCH']),
  effectiveScoreX10: z.number().int().nonnegative(),
  firedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
});

const entry = z.object({
  id: uuid,
  caseId: uuid,
  type: entryType,
  statement: z.string().min(1),
  officialName: z.string().min(1),
  ruleReference: z.string().min(1).nullable(),
  resolutionCode: resolutionCode.nullable(),
  incidentReportId: uuid.nullable(),
  scoringDecisionIds: z.array(uuid),
  occurredAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
});

const irregularShotCase = z.object({
  id: uuid,
  eventId: uuid,
  competitionId: uuid,
  resultScope,
  kind,
  subjectLaneId: uuid,
  adjacentLaneIds: z.array(uuid),
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  summary: z.string().min(1),
  ruleReference: z.string().min(1),
  openedBy: z.string().min(1),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  status: z.enum(['OPEN', 'REFERRED', 'RESOLVED', 'CLOSED', 'VOID']),
  publicationBlocked: z.boolean(),
  timeline: z.array(timelineObservation),
  evidence: z.array(evidence),
  entries: z.array(entry),
});

const list = z.object({ eventId: uuid, resultScope: resultScope.optional() });
const create = z.object({
  eventId: uuid,
  competitionId: uuid,
  resultScope,
  kind,
  subjectLaneId: uuid,
  adjacentLaneIds: z.array(uuid).max(6),
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  summary: z.string().trim().min(1).max(5000),
  ruleReference: z.string().trim().min(1).max(500).optional(),
  openedBy: z.string().trim().min(1).max(200),
  occurredAt: z.string().datetime(),
});
const addEvidence = z.object({
  caseId: uuid,
  observationId: uuid,
  relation: evidenceRelation,
  statement: z.string().trim().max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
});
const appendEntry = z.object({
  caseId: uuid,
  type: entryType,
  statement: z.string().trim().min(1).max(5000),
  officialName: z.string().trim().min(1).max(200),
  ruleReference: z.string().trim().min(1).max(500).optional(),
  resolutionCode: resolutionCode.optional(),
  incidentReportId: uuid.optional(),
  scoringDecisionIds: z.array(uuid).max(20).optional(),
  occurredAt: z.string().datetime().optional(),
});

export type IrregularShotCaseDto = z.infer<typeof irregularShotCase>;
export type ListIrregularShotCasesPayload = z.infer<typeof list>;
export type CreateIrregularShotCasePayload = z.infer<typeof create>;
export type AddIrregularShotEvidencePayload = z.infer<typeof addEvidence>;
export type AppendIrregularShotCaseEntryPayload = z.infer<typeof appendEntry>;

export const irregularShotCasesContract = defineContract('irregularShotCases', {
  list: query(list, queryResponseSchema(z.array(irregularShotCase))),
  create: command(create, commandDataResponseSchema(irregularShotCase)),
  addEvidence: command(addEvidence, commandDataResponseSchema(irregularShotCase)),
  appendEntry: command(appendEntry, commandDataResponseSchema(irregularShotCase)),
});
