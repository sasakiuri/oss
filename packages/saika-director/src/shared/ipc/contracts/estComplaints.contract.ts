import { z } from 'zod';

import { EstComplaintIssueSchema, EstComplaintSignalContextSchema } from '@/shared/mqtt';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();

const EstComplaintTimingAdvisoryDtoSchema = z.object({
  advisoryOnly: z.literal(true),
  status: z.enum([
    'TARGET_FAILURE_EXCEPTION',
    'SEPARATE_TARGET_PROCEDURE',
    'CAPTURED_BEFORE_NEXT_RECORDED_SHOT',
    'WITHIN_THREE_MINUTES_OF_LAST_RECORDED_SHOT',
    'REQUIRES_OFFICIAL_REVIEW',
  ]),
  elapsedMilliseconds: z.number().int().nonnegative().nullable(),
  ruleReference: z.string().min(1),
  guidance: z.string().min(1),
});

const EstComplaintObservationDtoSchema = z
  .object({
    signalId: uuidSchema,
    laneId: uuidSchema,
    firingPointNumber: z.number().int().positive().nullable(),
    status: z.enum(['ACTIVE', 'CLEARED']),
    issue: EstComplaintIssueSchema,
    context: EstComplaintSignalContextSchema,
    message: z.string().max(500).nullable(),
    signalledAt: z.string().datetime(),
    timing: EstComplaintTimingAdvisoryDtoSchema,
    targetExaminationCaseId: uuidSchema.nullable(),
    linkedBy: z.string().min(1).nullable(),
    linkedAt: z.string().datetime().nullable(),
  })
  .superRefine((observation, context) => {
    const linkValues = [observation.targetExaminationCaseId, observation.linkedBy, observation.linkedAt];
    const present = linkValues.filter((value) => value !== null).length;
    if (present !== 0 && present !== linkValues.length) {
      context.addIssue({ code: 'custom', message: 'Target examination link provenance must be complete' });
    }
  });

const OpenEstComplaintTargetExaminationInputSchema = z.object({
  signalId: uuidSchema,
  openedBy: z.string().trim().min(1).max(200),
  relayNumber: z.number().int().positive().optional(),
});

const OpenEstComplaintTargetExaminationResultDtoSchema = z.object({
  created: z.boolean(),
  targetExaminationCaseId: uuidSchema,
  observation: EstComplaintObservationDtoSchema,
});

export type EstComplaintTimingAdvisoryDto = z.infer<typeof EstComplaintTimingAdvisoryDtoSchema>;
export type EstComplaintObservationDto = z.infer<typeof EstComplaintObservationDtoSchema>;
export type OpenEstComplaintTargetExaminationPayload = z.infer<typeof OpenEstComplaintTargetExaminationInputSchema>;
export type OpenEstComplaintTargetExaminationResultDto = z.infer<
  typeof OpenEstComplaintTargetExaminationResultDtoSchema
>;

export const estComplaintsContract = defineContract('estComplaints', {
  listByCompetition: query(
    z.object({ competitionId: uuidSchema }),
    queryResponseSchema(z.array(EstComplaintObservationDtoSchema)),
  ),
  openTargetExamination: command(
    OpenEstComplaintTargetExaminationInputSchema,
    commandDataResponseSchema(OpenEstComplaintTargetExaminationResultDtoSchema),
  ),
});
