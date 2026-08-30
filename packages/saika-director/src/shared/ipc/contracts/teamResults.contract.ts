import { z } from 'zod';
import { defineContract, query, queryResponseSchema } from '../defineContract';

const formatSchema = z.enum(['THREE_MEMBER', 'MIXED_PAIR']);
const genderSchema = z.enum(['M', 'F', 'X', 'UNSPECIFIED']);
const entryStatusSchema = z.enum(['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB']);

const TeamResultSchema = z.object({
  rank: z.number().int().nonnegative(),
  teamId: z.string(),
  teamName: z.string(),
  nationCode: z.string().nullable(),
  eligible: z.boolean(),
  totalScore: z.number(),
  issues: z.array(z.string()),
  unresolvedTie: z.boolean(),
  ruleReferences: z.string(),
  tieEvidence: z.object({
    innerTens: z.number().int().nonnegative().nullable(),
    seriesTotals: z.array(z.number()),
    manualReviewRequired: z.boolean(),
  }),
  members: z.array(
    z.object({
      participantId: z.string(),
      playerName: z.string(),
      familyName: z.string(),
      nationCode: z.string().nullable(),
      gender: genderSchema,
      entryStatus: entryStatusSchema,
      totalScore: z.number().nullable(),
      classificationCode: z.string().nullable(),
      decisionCount: z.number().int().nonnegative(),
    }),
  ),
});

export type TeamResultFormatDto = z.infer<typeof formatSchema>;
export type TeamResultDto = z.infer<typeof TeamResultSchema>;

const MixedTeamFinalResultSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sourceCompetitionId: z.string().uuid(),
  teamId: z.string(),
  teamName: z.string(),
  nationCode: z.string(),
  rank: z.number().int().min(1).max(4),
  stage1Total: z.number(),
  stage2Total: z.number(),
  totalScore: z.number(),
  eliminatedAtShot: z.number().int().positive().nullable(),
  shootoffId: z.string().uuid().nullable(),
  remarks: z.string(),
  members: z
    .array(
      z.object({
        participantId: z.string(),
        playerName: z.string(),
        gender: genderSchema,
        firingPointNumber: z.number().int().positive(),
        stage1Shots: z.array(z.number()),
        stage2Shots: z.array(z.number()),
        totalScore: z.number(),
      }),
    )
    .length(2),
});
export type MixedTeamFinalResultDto = z.infer<typeof MixedTeamFinalResultSchema>;

export const teamResultsContract = defineContract('teamResults', {
  getQualification: query(
    z.object({ eventId: z.string().uuid(), format: formatSchema.default('THREE_MEMBER') }),
    queryResponseSchema(z.array(TeamResultSchema)),
  ),
  getMixedFinal: query(
    z.object({ eventId: z.string().uuid() }),
    queryResponseSchema(z.array(MixedTeamFinalResultSchema)),
  ),
});
