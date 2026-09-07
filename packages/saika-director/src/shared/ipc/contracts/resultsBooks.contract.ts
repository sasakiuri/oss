import { z } from 'zod';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

const uuid = z.string().uuid();
const officialRole = z.enum([
  'TECHNICAL_DELEGATE',
  'RTS_JURY_CHAIR',
  'COMPETITION_JURY_CHAIR',
  'EQUIPMENT_CONTROL_JURY_CHAIR',
  'RANGE_JURY_CHAIR',
  'RTS_OFFICER',
  'RANGE_OFFICER',
  'ORGANIZING_COMMITTEE',
  'OTHER',
]);
const recordCode = z.enum(['WR', 'QWR', 'EWR', 'EQWR', 'WRJ', 'QWRJ', 'EWRJ', 'EQWRJ', 'OR', 'EOR', 'QOR', 'EQOR']);
const recordResultBasis = z.enum(['QUALIFICATION_OR_ELIMINATION', 'FINAL', 'RECOGNIZED_NO_FINAL_TOTAL']);
const official = z.object({
  appointmentId: uuid,
  role: officialRole,
  officialName: z.string().min(1),
  organization: z.string().nullable(),
  appointedAt: z.string().datetime(),
});
const eligibleRecordMember = z.object({
  participantId: z.string().min(1),
  playerName: z.string().min(1),
  familyName: z.string().min(1),
  nationCode: z.string().nullable(),
  gender: z.string().min(1),
  entryStatus: z.string().min(1),
  scoreX10: z.number().int().nonnegative(),
  classificationCode: z.string().nullable(),
  decisionCount: z.number().int().nonnegative(),
});
const eligibleResult = z.object({
  eventId: uuid,
  eventName: z.string().min(1),
  resultScope: z.enum(['QUALIFICATION', 'FINAL']),
  resultId: uuid,
  subjectKind: z.enum(['INDIVIDUAL', 'TEAM', 'MIXED_TEAM']),
  subjectId: z.string().min(1),
  subjectName: z.string().min(1),
  nationCode: z.string().nullable(),
  entryStatus: z.string().min(1),
  scoreX10: z.number().int().nonnegative(),
  snapshotRevision: z.string().regex(/^[a-f0-9]{64}$/),
  members: z.array(eligibleRecordMember).optional(),
});
const claimEntry = z.object({
  id: uuid,
  type: z.enum(['TD_CONFIRMED', 'SUBMITTED', 'TECHNICAL_COMMITTEE_VERIFIED', 'REJECTED', 'REOPENED', 'VOID']),
  statement: z.string().min(1),
  officialName: z.string().min(1),
  appointmentId: uuid.nullable(),
  reference: z.string().nullable(),
  recordedAt: z.string().datetime(),
});
const claim = z.object({
  id: uuid,
  championshipId: uuid,
  source: eligibleResult,
  code: recordCode,
  resultBasis: recordResultBasis,
  benchmarkScoreX10: z.number().int().nonnegative(),
  ruleReference: z.string().min(1),
  claimedBy: z.string().min(1),
  achievedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'TD_CONFIRMED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'VOID']),
  entries: z.array(claimEntry),
});
const signer = z.object({ appointmentId: uuid, role: officialRole, officialName: z.string().min(1) });
const signature = signer.extend({ id: uuid, statement: z.string().min(1), signedAt: z.string().datetime() });
const book = z.object({
  id: uuid,
  championshipId: uuid,
  versionNumber: z.number().int().positive(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  findings: z.array(z.string()),
  requiredSigners: z.array(signer),
  signatures: z.array(signature),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  status: z.enum(['DRAFT', 'CERTIFIED']),
  finalizedAt: z.string().datetime().nullable(),
});
const workspace = z.object({
  officials: z.array(official),
  eligibleRecordResults: z.array(eligibleResult),
  recordClaims: z.array(claim),
  books: z.array(book),
});
const bookExport = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CANCELLED') }),
  z.object({
    status: z.literal('COMPLETED'),
    path: z.string().min(1),
    fileName: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);

export type ResultsBookWorkspaceDto = z.infer<typeof workspace>;
export type ChampionshipOfficialRoleDto = z.infer<typeof officialRole>;
export type RecordCodeDto = z.infer<typeof recordCode>;
export type RecordResultBasisDto = z.infer<typeof recordResultBasis>;
export type ResultsBookDto = z.infer<typeof book>;

export const resultsBooksContract = defineContract('resultsBooks', {
  getWorkspace: query(z.object({ championshipId: uuid }), queryResponseSchema(workspace)),
  appointOfficial: command(
    z.object({
      championshipId: uuid,
      role: officialRole,
      officialName: z.string().trim().min(1).max(200),
      organization: z.string().trim().min(1).max(200).optional(),
      statement: z.string().trim().min(1).max(2000),
      recordedBy: z.string().trim().min(1).max(200),
    }),
    commandDataResponseSchema(workspace),
  ),
  revokeOfficial: command(
    z.object({
      championshipId: uuid,
      appointmentId: uuid,
      statement: z.string().trim().min(1).max(2000),
      recordedBy: z.string().trim().min(1).max(200),
    }),
    commandDataResponseSchema(workspace),
  ),
  createRecordClaim: command(
    z.object({
      championshipId: uuid,
      resultId: uuid,
      resultScope: z.enum(['QUALIFICATION', 'FINAL']),
      code: recordCode,
      resultBasis: recordResultBasis,
      benchmarkScoreX10: z.number().int().nonnegative(),
      olympicGamesConfirmed: z.boolean().default(false),
      claimedBy: z.string().trim().min(1).max(200),
      achievedAt: z.string().datetime(),
    }),
    commandDataResponseSchema(workspace),
  ),
  appendRecordClaimEntry: command(
    z.object({
      championshipId: uuid,
      claimId: uuid,
      type: z.enum(['TD_CONFIRMED', 'SUBMITTED', 'TECHNICAL_COMMITTEE_VERIFIED', 'REJECTED', 'REOPENED', 'VOID']),
      statement: z.string().trim().min(1).max(5000),
      officialName: z.string().trim().min(1).max(200),
      appointmentId: uuid.optional(),
      reference: z.string().trim().min(1).max(1000).optional(),
    }),
    commandDataResponseSchema(workspace),
  ),
  generateBook: command(
    z.object({ championshipId: uuid, createdBy: z.string().trim().min(1).max(200) }),
    commandDataResponseSchema(workspace),
  ),
  signBook: command(
    z.object({
      championshipId: uuid,
      bookId: uuid,
      appointmentId: uuid,
      statement: z.string().trim().min(1).max(2000),
    }),
    commandDataResponseSchema(workspace),
  ),
  finalizeBook: command(
    z.object({
      championshipId: uuid,
      bookId: uuid,
      officialName: z.string().trim().min(1).max(200),
      statement: z.string().trim().min(1).max(2000),
    }),
    commandDataResponseSchema(workspace),
  ),
  exportBook: command(
    z.object({ bookId: uuid, format: z.enum(['JSON', 'HTML', 'PDF']).optional() }),
    commandDataResponseSchema(bookExport),
  ),
});
