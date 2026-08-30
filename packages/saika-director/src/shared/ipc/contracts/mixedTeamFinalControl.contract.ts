import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const member = z.object({
  laneId: z.string().uuid(),
  participantId: z.string(),
  athleteName: z.string().min(1),
  gender: z.enum(['M', 'F', 'X', 'UNSPECIFIED']),
  totalShotCount: z.number().int().nonnegative(),
  totalScoreX10: z.number().int().nonnegative(),
  finished: z.boolean(),
});
const team = z.object({
  teamId: z.string().min(1),
  teamName: z.string().min(1),
  nationCode: z.string().nullable(),
  members: z.array(member),
});
const input = z.object({
  competitionId: z.string().uuid(),
  competitionTypeId: z.string().min(1),
  teams: z.array(team).min(1),
});
const assessment = z.object({
  status: z.enum(['NOT_DUE', 'READY', 'TIE', 'COMPLETE', 'INCONSISTENT']),
  afterShot: z.number().int().positive().nullable(),
  expectedRank: z.number().int().min(2).max(4).nullable(),
  activeTeamIds: z.array(z.string()),
  candidateTeamIds: z.array(z.string()),
  guidance: z.string(),
});
const laneResult = z.object({
  laneId: z.string().uuid(),
  commandId: z.string().uuid(),
  status: z.enum(['DONE', 'ERROR', 'TIMEOUT']),
  error: z.string().nullable(),
});
const attempt = z.object({
  id: z.string().uuid(),
  laneResults: z.array(laneResult),
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});
const decision = z.object({
  id: z.string().uuid(),
  competitionId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  competitionTypeId: z.string(),
  afterShot: z.number().int().positive(),
  rank: z.number().int().min(2).max(4),
  selectedTeamId: z.string(),
  memberLaneIds: z.array(z.string().uuid()).length(2),
  scoreSnapshot: z.array(team),
  tiedTeamIds: z.array(z.string()),
  resolution: z.enum(['CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION']),
  resolutionStatement: z.string().nullable(),
  officialName: z.string(),
  ruleReference: z.string(),
  recordedAt: z.string().datetime(),
  voided: z.boolean(),
  commandCompleted: z.boolean(),
  latestLaneStatuses: z.record(z.string().uuid(), z.enum(['DONE', 'ERROR', 'TIMEOUT'])),
  commandAttempts: z.array(attempt),
});
const recordDecision = input.extend({
  id: z.string().uuid().optional(),
  eventId: z.string().uuid().optional(),
  selectedTeamId: z.string().min(1),
  resolution: z.enum(['CLEAR_LOWEST', 'SHOOT_OFF', 'JURY_DECISION']),
  resolutionStatement: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
  recordedAt: z.string().datetime().optional(),
});
const recordBatch = z.object({
  id: z.string().uuid().optional(),
  decisionId: z.string().uuid(),
  laneResults: z.array(laneResult).min(1),
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

export type MixedTeamFinalMemberDto = z.infer<typeof member>;
export type MixedTeamFinalSnapshotDto = z.infer<typeof team>;
export type MixedTeamFinalAssessmentDto = z.infer<typeof assessment>;
export type MixedTeamFinalDecisionDto = z.infer<typeof decision>;
export type AssessMixedTeamFinalPayload = z.infer<typeof input>;
export type RecordMixedTeamFinalDecisionPayload = z.infer<typeof recordDecision>;
export type RecordMixedTeamFinalCommandBatchPayload = z.infer<typeof recordBatch>;
export type VoidMixedTeamFinalDecisionPayload = z.infer<typeof voidDecision>;

export const mixedTeamFinalControlContract = defineContract('mixedTeamFinalControl', {
  list: query(z.object({ competitionId: z.string().uuid() }), queryResponseSchema(z.array(decision))),
  assess: query(input, queryResponseSchema(assessment)),
  recordDecision: command(recordDecision, commandDataResponseSchema(decision)),
  recordCommandBatch: command(recordBatch, commandDataResponseSchema(decision)),
  voidDecision: command(voidDecision, commandDataResponseSchema(decision)),
});
