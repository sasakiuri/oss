import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();

export const ScoringDecisionTypeSchema = z.enum([
  'DEDUCTION',
  'ANNUL_SHOT',
  'MARK_MISS',
  'WARNING',
  'DISQUALIFICATION',
  'REMARK',
  'MALFUNCTION',
  'EXTRA_TIME',
  'REPEAT_SHOT',
  'REPEAT_SERIES',
  'REVOCATION',
]);

export const ScoringApplicationPolicySchema = z.enum(['NONE', 'SPECIFIC_SHOT', 'LOWEST_SHOT_IN_SERIES']);

export const ScoringClassificationCodeSchema = z.enum(['DSQ', 'DQB', 'AD_DSQ']);

export const ScoringDecisionDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  participantId: z.string().min(1),
  relayNumber: z.number().int().positive(),
  resultScope: z.enum(['QUALIFICATION', 'FINAL']),
  resultIdAtDecision: uuidSchema,
  sourceCompetitionId: uuidSchema.nullable(),
  type: ScoringDecisionTypeSchema,
  applicationPolicy: ScoringApplicationPolicySchema,
  pointsX10: z.number().int().positive().nullable(),
  seriesIndex: z.number().int().nonnegative().nullable(),
  shotIndex: z.number().int().nonnegative().nullable(),
  classificationCode: ScoringClassificationCodeSchema.nullable(),
  ruleReference: z.string().min(1),
  incidentReportNumber: z.string().min(1).nullable(),
  publicRemark: z.string().min(1),
  internalNote: z.string().min(1).nullable(),
  officialName: z.string().min(1),
  decidedAt: z.string().datetime(),
  reversesDecisionId: uuidSchema.nullable(),
  active: z.boolean(),
});

const AddScoringDecisionInputSchema = z
  .object({
    resultId: uuidSchema,
    resultScope: z.enum(['QUALIFICATION', 'FINAL']),
    type: ScoringDecisionTypeSchema.exclude(['REVOCATION']),
    applicationPolicy: ScoringApplicationPolicySchema,
    pointsX10: z.number().int().positive().optional(),
    seriesIndex: z.number().int().nonnegative().optional(),
    shotIndex: z.number().int().nonnegative().optional(),
    classificationCode: ScoringClassificationCodeSchema.optional(),
    ruleReference: z.string().trim().min(1).max(100),
    incidentReportNumber: z.string().trim().min(1).max(100).optional(),
    publicRemark: z.string().trim().min(1).max(500),
    internalNote: z.string().trim().min(1).max(2000).optional(),
    officialName: z.string().trim().min(1).max(200),
  })
  .superRefine((input, context) => {
    if (input.type === 'DEDUCTION') {
      if (input.pointsX10 === undefined) {
        context.addIssue({ code: 'custom', path: ['pointsX10'], message: 'Deduction points are required' });
      }
      if (input.seriesIndex === undefined) {
        context.addIssue({ code: 'custom', path: ['seriesIndex'], message: 'A deduction series is required' });
      }
      if (!['SPECIFIC_SHOT', 'LOWEST_SHOT_IN_SERIES'].includes(input.applicationPolicy)) {
        context.addIssue({ code: 'custom', path: ['applicationPolicy'], message: 'Select a deduction policy' });
      }
      if (input.applicationPolicy === 'SPECIFIC_SHOT' && input.shotIndex === undefined) {
        context.addIssue({ code: 'custom', path: ['shotIndex'], message: 'A target shot is required' });
      }
    }
    if (input.type === 'ANNUL_SHOT' || input.type === 'MARK_MISS') {
      if (input.applicationPolicy !== 'SPECIFIC_SHOT') {
        context.addIssue({ code: 'custom', path: ['applicationPolicy'], message: 'A specific shot is required' });
      }
      if (input.seriesIndex === undefined || input.shotIndex === undefined) {
        context.addIssue({ code: 'custom', path: ['shotIndex'], message: 'A target series and shot are required' });
      }
    }
    if (input.type === 'DISQUALIFICATION' && input.classificationCode === undefined) {
      context.addIssue({ code: 'custom', path: ['classificationCode'], message: 'A classification code is required' });
    }
  });

const RevokeScoringDecisionInputSchema = z.object({
  decisionId: uuidSchema,
  ruleReference: z.string().trim().min(1).max(100),
  incidentReportNumber: z.string().trim().min(1).max(100).optional(),
  reason: z.string().trim().min(1).max(500),
  internalNote: z.string().trim().min(1).max(2000).optional(),
  officialName: z.string().trim().min(1).max(200),
});

export type ScoringDecisionDto = z.infer<typeof ScoringDecisionDtoSchema>;
export type AddScoringDecisionPayload = z.infer<typeof AddScoringDecisionInputSchema>;
export type RevokeScoringDecisionPayload = z.infer<typeof RevokeScoringDecisionInputSchema>;
export type ScoringDecisionListResponse = { decisions: ScoringDecisionDto[] };

export const scoringDecisionsContract = defineContract('scoringDecisions', {
  add: command(AddScoringDecisionInputSchema, commandDataResponseSchema(ScoringDecisionDtoSchema)),
  revoke: command(RevokeScoringDecisionInputSchema, commandDataResponseSchema(ScoringDecisionDtoSchema)),
  listByResult: query(
    z.object({ resultId: uuidSchema, resultScope: z.enum(['QUALIFICATION', 'FINAL']) }),
    queryResponseSchema(z.object({ decisions: z.array(ScoringDecisionDtoSchema) })),
  ),
});
