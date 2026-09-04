import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const listKind = z.enum(['PRE_EVENT_TRAINING', 'ELIMINATION', 'QUALIFICATION', 'FINAL', 'OTHER']);
const disciplineGroup = z.enum(['RIFLE_PISTOL', 'SHOTGUN', 'OTHER']);
const distributionMode = z.enum(['PRINTED', 'PAPERLESS']);
const officialRole = z.enum(['TECHNICAL_DELEGATE', 'RTS_JURY', 'RTS_OFFICER', 'ORGANIZING_COMMITTEE', 'OTHER']);
const channel = z.enum(['PRINT', 'EMAIL', 'VENUE_WIFI', 'PUBLIC_INFORMATION_STATION', 'WEBSITE', 'OTHER']);
const finalReleaseBasis = z.enum(['PROTESTS_CLEARED', 'NO_QUALIFICATION_IMPACT']);

const row = z.object({
  participantId: uuid,
  startNumber: z.string().nullable(),
  issfId: z.string().nullable(),
  athleteName: z.string().min(1),
  familyName: z.string().min(1),
  affiliation: z.string(),
  nationCode: z.string().nullable(),
  gender: z.enum(['M', 'F', 'X', 'UNSPECIFIED']),
  entryStatus: z.enum(['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB', 'AD_DSQ']),
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
  relayNumber: z.number().int().positive().nullable(),
  firingPointNumber: z.number().int().positive().nullable(),
});

const finding = z.object({
  code: z.string().min(1),
  severity: z.enum(['INFO', 'WARNING', 'BLOCKING']),
  message: z.string().min(1),
  ruleReference: z.string().min(1),
});

const entry = z.object({
  id: uuid,
  versionId: uuid,
  type: z.enum(['CONTENT_APPROVED', 'PAPERLESS_APPROVED', 'DISTRIBUTED', 'VOID', 'WITHDRAWN']),
  officialName: z.string().min(1),
  officialRole,
  statement: z.string().min(1),
  channels: z.array(channel),
  finalReleaseBasis: finalReleaseBasis.nullable(),
  recordedAt: z.string().datetime(),
});

const version = z.object({
  id: uuid,
  eventId: uuid,
  versionNumber: z.number().int().positive(),
  listKind,
  disciplineGroup,
  distributionMode,
  eventNameSnapshot: z.string().min(1),
  competitionTypeIdSnapshot: z.string().min(1),
  scheduledStartAt: z.string().datetime(),
  publicationDueAt: z.string().datetime(),
  substitutionDeadlineAt: z.string().datetime(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  rows: z.array(row),
  findings: z.array(finding),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'APPROVED', 'DISTRIBUTED', 'VOID', 'WITHDRAWN']),
  contentApproval: entry.nullable(),
  paperlessApproval: entry.nullable(),
  distributions: z.array(entry),
  voidEntry: entry.nullable(),
  withdrawalEntry: entry.nullable(),
  distributedChannels: z.array(channel),
  deadlineStatus: z.enum(['PENDING', 'ON_TIME', 'LATE']),
  stale: z.boolean(),
  integrityValid: z.boolean(),
  isCurrent: z.boolean(),
});

const createVersion = z.object({
  eventId: uuid,
  listKind,
  disciplineGroup,
  distributionMode,
  scheduledStartAt: z.string().datetime(),
  publicationDueAt: z.string().datetime(),
  createdBy: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime().optional(),
});

const approval = z.object({
  versionId: uuid,
  officialName: z.string().trim().min(1).max(200),
  officialRole,
  statement: z.string().trim().min(1).max(2000),
  recordedAt: z.string().datetime().optional(),
});

const distribution = approval.extend({
  channels: z
    .array(channel)
    .min(1)
    .refine((values) => new Set(values).size === values.length),
  finalReleaseBasis: finalReleaseBasis.optional(),
});

export type StartListKindDto = z.infer<typeof listKind>;
export type StartListDisciplineGroupDto = z.infer<typeof disciplineGroup>;
export type StartListDistributionModeDto = z.infer<typeof distributionMode>;
export type StartListOfficialRoleDto = z.infer<typeof officialRole>;
export type StartListDistributionChannelDto = z.infer<typeof channel>;
export type StartListFinalReleaseBasisDto = z.infer<typeof finalReleaseBasis>;
export type StartListRowDto = z.infer<typeof row>;
export type StartListFindingDto = z.infer<typeof finding>;
export type StartListEntryDto = z.infer<typeof entry>;
export type StartListVersionDto = z.infer<typeof version>;
export type CreateStartListVersionPayload = z.infer<typeof createVersion>;
export type StartListApprovalPayload = z.infer<typeof approval>;
export type DistributeStartListPayload = z.infer<typeof distribution>;

export const startListsContract = defineContract('startLists', {
  list: query(z.object({ eventId: uuid }), queryResponseSchema(z.array(version))),
  createVersion: command(createVersion, commandDataResponseSchema(version)),
  approveContent: command(approval, commandDataResponseSchema(version)),
  approvePaperless: command(approval, commandDataResponseSchema(version)),
  distribute: command(distribution, commandDataResponseSchema(version)),
  voidVersion: command(approval, commandDataResponseSchema(version)),
  withdrawDistribution: command(approval, commandDataResponseSchema(version)),
});
