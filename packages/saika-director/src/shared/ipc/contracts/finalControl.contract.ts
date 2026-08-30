import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const laneSnapshot = z.object({
  laneId: z.string().uuid(),
  athleteName: z.string().min(1),
  totalShotCount: z.number().int().nonnegative(),
  totalScoreX10: z.number().int().nonnegative(),
  finished: z.boolean(),
});

const assessmentInput = z.object({
  competitionId: z.string().uuid(),
  competitionTypeId: z.string().min(1),
  participantCount: z.number().int().min(2).max(99),
  lanes: z.array(laneSnapshot).min(2),
});

const assessment = z.object({
  status: z.enum(['NOT_DUE', 'READY', 'TIE', 'COMPLETE', 'INCONSISTENT']),
  afterShot: z.number().int().positive().nullable(),
  expectedRank: z.number().int().min(2).nullable(),
  activeLaneIds: z.array(z.string().uuid()),
  candidateLaneIds: z.array(z.string().uuid()),
  guidance: z.string().min(1),
});

const commandAttempt = z.object({
  id: z.string().uuid(),
  commandId: z.string().uuid(),
  status: z.enum(['DONE', 'ERROR', 'TIMEOUT']),
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});

const decision = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  competitionTypeId: z.string(),
  participantCount: z.number().int().min(2),
  afterShot: z.number().int().positive(),
  rank: z.number().int().min(2),
  selectedLaneId: z.string().uuid(),
  scoreSnapshot: z.array(laneSnapshot),
  tiedLaneIds: z.array(z.string().uuid()),
  resolution: z.enum(['CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION']),
  resolutionStatement: z.string().nullable(),
  officialName: z.string(),
  ruleReference: z.string(),
  recordedAt: z.string().datetime(),
  voided: z.boolean(),
  commandCompleted: z.boolean(),
  commandAttempts: z.array(commandAttempt),
});

const recordDecision = assessmentInput.extend({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  selectedLaneId: z.string().uuid(),
  resolution: z.enum(['CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION']),
  resolutionStatement: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const recordCommandResult = z.object({
  id: z.string().uuid().optional(),
  decisionId: z.string().uuid(),
  commandId: z.string().uuid(),
  status: z.enum(['DONE', 'ERROR', 'TIMEOUT']),
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

const voidDecision = z.object({
  id: z.string().uuid().optional(),
  decisionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});

export type FinalControlLaneSnapshotDto = z.infer<typeof laneSnapshot>;
export type FinalCheckpointAssessmentDto = z.infer<typeof assessment>;
export type FinalControlDecisionDto = z.infer<typeof decision>;
export type AssessFinalCheckpointPayload = z.infer<typeof assessmentInput>;
export type RecordFinalControlDecisionPayload = z.infer<typeof recordDecision>;
export type RecordFinalControlCommandResultPayload = z.infer<typeof recordCommandResult>;
export type VoidFinalControlDecisionPayload = z.infer<typeof voidDecision>;

export const finalControlContract = defineContract('finalControl', {
  list: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(z.array(decision))),
  assess: query(assessmentInput, queryResponseSchema(assessment)),
  recordDecision: command(recordDecision, commandDataResponseSchema(decision)),
  recordCommandResult: command(recordCommandResult, commandDataResponseSchema(decision)),
  voidDecision: command(voidDecision, commandDataResponseSchema(decision)),
});
