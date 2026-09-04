import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const linkBasis = z.enum(['ISSF_ID', 'MANUAL']);
const classificationCode = z.enum(['DSQ', 'DQB', 'AD_DSQ']);
const sanctionScope = z.enum(['EVENT', 'CHAMPIONSHIP']);
const authorityBasis = z.enum(['JURY_MAJORITY', 'POST_COMPETITION_CHECK', 'ANTI_DOPING_DECISION']);
const officialRole = z.enum(['JURY_MEMBER', 'EQUIPMENT_CONTROL_JURY', 'ANTI_DOPING_AUTHORITY']);
const authorizationMode = z.enum(['MANUAL_ATTESTATION', 'AUTHENTICATED_SESSION']);
const entryStatus = z.enum(['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB']);

const championshipScope = z.object({ championshipId: uuid });

const identity = z.object({
  id: uuid,
  championshipId: uuid,
  displayName: z.string(),
  issfId: z.string().nullable(),
  createdBy: z.string(),
  creationStatement: z.string(),
  createdAt: z.string().datetime(),
});

const participantEntry = z.object({
  participantId: uuid,
  eventId: uuid,
  eventName: z.string(),
  championshipId: uuid,
  playerName: z.string(),
  issfId: z.string().nullable(),
  entryStatus,
});

const identityLink = z.object({
  id: uuid,
  athleteIdentityId: uuid,
  participantId: uuid,
  eventIdSnapshot: uuid,
  eventNameSnapshot: z.string(),
  playerNameSnapshot: z.string(),
  issfIdSnapshot: z.string().nullable(),
  entryType: z.enum(['LINKED', 'UNLINKED']),
  linkBasis,
  statement: z.string(),
  officialName: z.string(),
  recordedAt: z.string().datetime(),
  reversesLinkId: uuid.nullable(),
});

const sanctionDecision = z.object({
  id: uuid,
  athleteIdentityId: uuid,
  sourceEventId: uuid,
  decisionType: z.enum(['IMPOSED', 'REVOKED']),
  classificationCode,
  scope: sanctionScope,
  authorityBasis,
  authorityReference: z.string(),
  officialName: z.string(),
  officialRole,
  officialActorId: z.string().nullable(),
  authorizationMode,
  ruleReference: z.string(),
  incidentReportNumber: z.string().nullable(),
  publicRemark: z.string(),
  internalNote: z.string().nullable(),
  decidedAt: z.string().datetime(),
  recordedAt: z.string().datetime(),
  reversesDecisionId: uuid.nullable(),
});

const workspace = z.object({
  championshipId: uuid,
  identities: z.array(identity),
  participantEntries: z.array(participantEntry),
  linkHistory: z.array(identityLink),
  activeLinks: z.array(identityLink),
  sanctionHistory: z.array(sanctionDecision),
  activeSanctions: z.array(sanctionDecision),
});

const manualAuthorization = z.object({
  authorityBasis,
  authorityReference: z.string().trim().min(1).max(500),
  officialName: z.string().trim().min(1).max(200),
  officialRole,
});

const createIdentity = championshipScope.extend({
  displayName: z.string().trim().min(1).max(300),
  issfId: z.string().trim().min(1).max(100).nullable().optional(),
  participantIds: z.array(uuid).min(1),
  linkBasis,
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});

const linkParticipant = z.object({
  athleteIdentityId: uuid,
  participantId: uuid,
  linkBasis,
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});

const unlinkParticipant = z.object({
  linkId: uuid,
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});

const synchronizeIssfIdentities = championshipScope.extend({
  statement: z.string().trim().min(1).max(2000),
  officialName: z.string().trim().min(1).max(200),
});

const imposeSanction = manualAuthorization.extend({
  athleteIdentityId: uuid,
  sourceEventId: uuid,
  classificationCode,
  scope: sanctionScope,
  ruleReference: z.string().trim().min(1).max(500),
  incidentReportNumber: z.string().trim().min(1).max(200).nullable().optional(),
  publicRemark: z.string().trim().min(1).max(2000),
  internalNote: z.string().trim().min(1).max(5000).nullable().optional(),
  decidedAt: z.string().datetime().optional(),
});

const revokeSanction = manualAuthorization.extend({
  decisionId: uuid,
  ruleReference: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(1).max(2000),
  internalNote: z.string().trim().min(1).max(5000).nullable().optional(),
  decidedAt: z.string().datetime().optional(),
});

const synchronizationResult = z.object({
  workspace,
  identitiesCreated: z.number().int().nonnegative(),
  participantsLinked: z.number().int().nonnegative(),
});

export type AthleteSanctionWorkspaceDto = z.infer<typeof workspace>;
export type AthleteIdentityDto = z.infer<typeof identity>;
export type AthleteIdentityLinkDto = z.infer<typeof identityLink>;
export type AthleteSanctionDecisionDto = z.infer<typeof sanctionDecision>;
export type CreateAthleteIdentityPayload = z.infer<typeof createIdentity>;
export type LinkAthleteParticipantPayload = z.infer<typeof linkParticipant>;
export type UnlinkAthleteParticipantPayload = z.infer<typeof unlinkParticipant>;
export type SynchronizeIssfAthleteIdentitiesPayload = z.infer<typeof synchronizeIssfIdentities>;
export type ImposeAthleteSanctionPayload = z.infer<typeof imposeSanction>;
export type RevokeAthleteSanctionPayload = z.infer<typeof revokeSanction>;

export const athleteSanctionsContract = defineContract('athleteSanctions', {
  getWorkspace: query(championshipScope, queryResponseSchema(workspace)),
  createIdentity: command(createIdentity, commandDataResponseSchema(workspace)),
  linkParticipant: command(linkParticipant, commandDataResponseSchema(workspace)),
  unlinkParticipant: command(unlinkParticipant, commandDataResponseSchema(workspace)),
  synchronizeIssfIdentities: command(synchronizeIssfIdentities, commandDataResponseSchema(synchronizationResult)),
  imposeSanction: command(imposeSanction, commandDataResponseSchema(workspace)),
  revokeSanction: command(revokeSanction, commandDataResponseSchema(workspace)),
});
