import { z } from 'zod';

import { ScoringDecisionTypeSchema } from './scoringDecisions.contract';
import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuidSchema = z.string().uuid();
const officialRoleSchema = z.enum([
  'RANGE_OFFICER',
  'COMPETITION_JURY_MEMBER',
  'RTS_OFFICER',
  'RTS_JURY_MEMBER',
  'RANKING_TECHNICAL_OFFICER',
  'OTHER_OFFICIAL',
]);

const IncidentReportEntryDtoSchema = z.object({
  id: uuidSchema,
  reportId: uuidSchema,
  type: z.enum(['SIGNATURE', 'FORWARDED', 'NOTE', 'VOID']),
  officialRole: officialRoleSchema.nullable(),
  destination: z.string().min(1).nullable(),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  recordedAt: z.string().datetime(),
});

const IncidentReportLinkedDecisionDtoSchema = z.object({
  id: uuidSchema,
  participantId: z.string().min(1),
  relayNumber: z.number().int().positive(),
  resultScope: z.enum(['QUALIFICATION', 'FINAL']),
  resultId: uuidSchema,
  type: ScoringDecisionTypeSchema,
  ruleReference: z.string().min(1),
  publicRemark: z.string().min(1),
  officialName: z.string().min(1),
  decidedAt: z.string().datetime(),
  active: z.boolean(),
});

const RangeIncidentReportDtoSchema = z.object({
  id: uuidSchema,
  eventId: uuidSchema,
  serialNumber: z.string().min(1),
  eventName: z.string().min(1),
  occurredAt: z.string().datetime(),
  relayNumber: z.number().int().positive().nullable(),
  firingPointNumber: z.number().int().positive().nullable(),
  athleteName: z.string().min(1).nullable(),
  bibNumber: z.string().min(1).nullable(),
  nationality: z.string().min(1).nullable(),
  stage: z.string().min(1).nullable(),
  series: z.string().min(1).nullable(),
  details: z.string().min(1),
  ruleReferences: z.string().min(1),
  penalty: z.string().min(1).nullable(),
  scoreAmendmentReference: z.string().min(1).nullable(),
  initiatorRole: officialRoleSchema,
  initiatorName: z.string().min(1),
  createdAt: z.string().datetime(),
  entries: z.array(IncidentReportEntryDtoSchema),
  linkedDecisions: z.array(IncidentReportLinkedDecisionDtoSchema),
  missingSignatureRoles: z.array(officialRoleSchema),
  forwarded: z.boolean(),
  voided: z.boolean(),
});

const UncoveredIncidentDecisionDtoSchema = IncidentReportLinkedDecisionDtoSchema.extend({
  incidentReportNumber: z.string().min(1).nullable(),
  coverageIssue: z.enum(['MISSING_REFERENCE', 'REPORT_NOT_FOUND', 'REPORT_VOIDED']),
});

const IncidentReportEventStatusDtoSchema = z.object({
  eventId: uuidSchema,
  reports: z.array(RangeIncidentReportDtoSchema),
  requiredDecisionCount: z.number().int().nonnegative(),
  coveredDecisionCount: z.number().int().nonnegative(),
  uncoveredDecisions: z.array(UncoveredIncidentDecisionDtoSchema),
});

const CreateRangeIncidentReportInputSchema = z.object({
  eventId: uuidSchema,
  serialNumber: z.string().trim().min(1).max(100),
  occurredAt: z.string().datetime(),
  relayNumber: z.number().int().positive().optional(),
  firingPointNumber: z.number().int().positive().optional(),
  athleteName: z.string().trim().min(1).max(300).optional(),
  bibNumber: z.string().trim().min(1).max(100).optional(),
  nationality: z.string().trim().min(1).max(100).optional(),
  stage: z.string().trim().min(1).max(200).optional(),
  series: z.string().trim().min(1).max(100).optional(),
  details: z.string().trim().min(1).max(5000),
  ruleReferences: z.string().trim().min(1).max(500),
  penalty: z.string().trim().min(1).max(1000).optional(),
  scoreAmendmentReference: z.string().trim().min(1).max(200).optional(),
  initiatorRole: officialRoleSchema,
  initiatorName: z.string().trim().min(1).max(200),
});

const entryBase = {
  reportId: uuidSchema,
  officialName: z.string().trim().min(1).max(200),
};

const AppendIncidentReportEntryInputSchema = z.discriminatedUnion('type', [
  z.object({
    ...entryBase,
    type: z.literal('SIGNATURE'),
    officialRole: officialRoleSchema,
    statement: z.string().trim().min(1).max(1000).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('FORWARDED'),
    destination: z.string().trim().min(1).max(300),
    statement: z.string().trim().min(1).max(1000).optional(),
  }),
  z.object({
    ...entryBase,
    type: z.literal('NOTE'),
    statement: z.string().trim().min(1).max(2000),
  }),
  z.object({
    ...entryBase,
    type: z.literal('VOID'),
    statement: z.string().trim().min(1).max(2000),
  }),
]);

export type IncidentReportOfficialRoleDto = z.infer<typeof officialRoleSchema>;
export type IncidentReportEntryDto = z.infer<typeof IncidentReportEntryDtoSchema>;
export type IncidentReportLinkedDecisionDto = z.infer<typeof IncidentReportLinkedDecisionDtoSchema>;
export type RangeIncidentReportDto = z.infer<typeof RangeIncidentReportDtoSchema>;
export type UncoveredIncidentDecisionDto = z.infer<typeof UncoveredIncidentDecisionDtoSchema>;
export type IncidentReportEventStatusDto = z.infer<typeof IncidentReportEventStatusDtoSchema>;
export type CreateRangeIncidentReportPayload = z.infer<typeof CreateRangeIncidentReportInputSchema>;
export type AppendIncidentReportEntryPayload = z.infer<typeof AppendIncidentReportEntryInputSchema>;

export const incidentReportsContract = defineContract('incidentReports', {
  listByEvent: query(z.object({ eventId: uuidSchema }), queryResponseSchema(IncidentReportEventStatusDtoSchema)),
  getById: query(z.object({ reportId: uuidSchema }), queryResponseSchema(RangeIncidentReportDtoSchema)),
  create: command(CreateRangeIncidentReportInputSchema, commandDataResponseSchema(RangeIncidentReportDtoSchema)),
  appendEntry: command(AppendIncidentReportEntryInputSchema, commandDataResponseSchema(IncidentReportEntryDtoSchema)),
});
