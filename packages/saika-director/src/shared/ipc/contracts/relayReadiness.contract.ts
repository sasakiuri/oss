import { z } from 'zod';
import { commandDataResponseSchema, defineContract, query, queryResponseSchema, command } from '../defineContract';

const phaseSchema = z.enum(['RELAY', 'SIGHTING', 'MATCH']);
const operationalPhaseSchema = z.enum(['SIGHTING', 'MATCH']);
const requirementSchema = z.enum([
  'RANGE_EQUIPMENT_READY',
  'TARGET_MODE_CONFIRMED',
  'BACKUP_MEMORY_READY',
  'TARGET_WHITE_SURFACE_CLEAR',
  'TARGET_FRAME_MARKS_INDICATED',
  'CONTROL_SHEET_RENEWED',
  'BACKING_MATERIAL_CLEAR',
]);
const stateSchema = z.enum(['CONFIRMED', 'REVOKED']);
const sourceSchema = z.enum(['MANUAL', 'LANE_REPORTED', 'IMPORT']);

const scopeSchema = z.object({
  competitionId: z.string().min(1),
  relayNumber: z.number().int().positive(),
  phase: phaseSchema,
});

const assessmentScopeSchema = scopeSchema.extend({ phase: operationalPhaseSchema });

const entrySchema = z.object({
  id: z.string().uuid(),
  competitionId: z.string(),
  relayNumber: z.number().int().positive(),
  laneId: z.string().nullable(),
  phase: phaseSchema,
  requirement: requirementSchema,
  state: stateSchema,
  source: sourceSchema,
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
});

const recordSchema = scopeSchema.extend({
  laneId: z.string().min(1).nullable().optional(),
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
  mayStart: z.boolean(),
  items: z.array(
    z.object({
      requirement: requirementSchema,
      laneId: z.string().nullable(),
      phase: phaseSchema,
      label: z.string().min(1),
      ruleReference: z.string(),
      required: z.boolean(),
      confirmed: z.boolean(),
      latestEntry: entrySchema.nullable(),
    }),
  ),
});

export type RelayReadinessScopePayload = z.infer<typeof scopeSchema>;
export type RecordRelayReadinessPayload = z.infer<typeof recordSchema>;
export type RelayReadinessEntryDto = z.infer<typeof entrySchema>;
export type RelayReadinessAssessmentDto = z.infer<typeof assessmentSchema>;

export const relayReadinessContract = defineContract('relayReadiness', {
  list: query(scopeSchema, queryResponseSchema(z.array(entrySchema))),
  record: command(recordSchema, commandDataResponseSchema(entrySchema)),
  assess: query(
    assessmentScopeSchema.extend({ laneIds: z.array(z.string().min(1)) }),
    queryResponseSchema(assessmentSchema),
  ),
});
