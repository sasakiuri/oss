import { z } from 'zod';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const phaseSchema = z.enum(['PRE_RELAY', 'POST_RELAY']);
const requirementSchema = z.enum([
  'ATHLETE_IDENTITY_BIB_VERIFIED',
  'EQUIPMENT_APPROVAL_VERIFIED',
  'FIREARM_UNLOADED_SAFETY_FLAG_VERIFIED',
  'PRINTOUT_ATHLETE_SIGNED',
  'PRINTOUT_OFFICIAL_INITIALLED',
  'ATHLETE_RELEASED',
]);
const stateSchema = z.enum(['CONFIRMED', 'REVOKED']);
const sourceSchema = z.enum(['MANUAL', 'LANE_REPORTED', 'IMPORT']);

const athleteSchema = z.object({
  laneId: z.string().min(1),
  athleteId: z.string().min(1),
  athleteName: z.string().min(1),
  athleteStartNumber: z.number().int().positive(),
});

const scopeSchema = z.object({
  competitionId: z.string().min(1),
  relayNumber: z.number().int().positive(),
  phase: phaseSchema,
});

const entrySchema = scopeSchema.extend({
  id: z.string().uuid(),
  ...athleteSchema.shape,
  requirement: requirementSchema,
  state: stateSchema,
  source: sourceSchema,
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});

const recordSchema = scopeSchema.extend({
  ...athleteSchema.shape,
  requirement: requirementSchema,
  state: stateSchema,
  source: sourceSchema.default('MANUAL'),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime().optional(),
});

const assessmentSchema = z.object({
  mode: z.enum(['DISABLED', 'ADVISORY', 'REQUIRED']),
  ready: z.boolean(),
  mayProceed: z.boolean(),
  items: z.array(
    z.object({
      requirement: requirementSchema,
      laneId: z.string(),
      athleteId: z.string(),
      phase: phaseSchema,
      label: z.string(),
      ruleReference: z.string(),
      required: z.boolean(),
      alternativeGroup: z.string().nullable(),
      confirmed: z.boolean(),
      latestEntry: entrySchema.nullable(),
    }),
  ),
});

export type RelayAthleteLifecycleScopePayload = z.infer<typeof scopeSchema>;
export type RelayAthleteIdentityPayload = z.infer<typeof athleteSchema>;
export type RecordRelayAthleteLifecyclePayload = z.infer<typeof recordSchema>;
export type RelayAthleteLifecycleEntryDto = z.infer<typeof entrySchema>;
export type RelayAthleteLifecycleAssessmentDto = z.infer<typeof assessmentSchema>;

export const relayAthleteLifecycleContract = defineContract('relayAthleteLifecycle', {
  list: query(scopeSchema, queryResponseSchema(z.array(entrySchema))),
  record: command(recordSchema, commandDataResponseSchema(entrySchema)),
  assess: query(scopeSchema.extend({ athletes: z.array(athleteSchema) }), queryResponseSchema(assessmentSchema)),
});
