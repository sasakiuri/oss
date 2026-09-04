import type { ChampionshipOfficialRole, RecordCode, RecordResultBasis } from './ResultsBookPolicy';

export interface EligibleRecordMember {
  readonly participantId: string;
  readonly playerName: string;
  readonly familyName: string;
  readonly nationCode: string | null;
  readonly gender: string;
  readonly entryStatus: string;
  readonly scoreX10: number;
  readonly classificationCode: string | null;
  readonly decisionCount: number;
}

export interface ChampionshipOfficialEntry {
  readonly id: string;
  readonly championshipId: string;
  readonly operation: 'APPOINT' | 'REVOKE';
  readonly role: ChampionshipOfficialRole;
  readonly officialName: string;
  readonly organization: string | null;
  readonly statement: string;
  readonly recordedBy: string;
  readonly recordedAt: Date;
  readonly reversesEntryId: string | null;
}

export interface EligibleRecordResult {
  readonly eventId: string;
  readonly eventName: string;
  readonly resultScope: 'QUALIFICATION' | 'FINAL';
  readonly resultId: string;
  readonly subjectKind: 'INDIVIDUAL' | 'TEAM' | 'MIXED_TEAM';
  readonly subjectId: string;
  readonly subjectName: string;
  readonly nationCode: string | null;
  readonly entryStatus: string;
  readonly scoreX10: number;
  readonly snapshotRevision: string;
  /** Immutable member evidence for aggregate record subjects. */
  readonly members?: readonly EligibleRecordMember[];
}

export interface RecordClaim {
  readonly id: string;
  readonly championshipId: string;
  readonly source: EligibleRecordResult;
  readonly code: RecordCode;
  readonly resultBasis: RecordResultBasis;
  readonly benchmarkScoreX10: number;
  readonly ruleReference: string;
  readonly claimedBy: string;
  readonly achievedAt: Date;
  readonly createdAt: Date;
}

export interface RecordClaimEntry {
  readonly id: string;
  readonly claimId: string;
  readonly type: 'TD_CONFIRMED' | 'SUBMITTED' | 'TECHNICAL_COMMITTEE_VERIFIED' | 'REJECTED' | 'REOPENED' | 'VOID';
  readonly statement: string;
  readonly officialName: string;
  readonly appointmentId: string | null;
  readonly reference: string | null;
  readonly recordedAt: Date;
}

export interface ResultsBookVersion {
  readonly id: string;
  readonly championshipId: string;
  readonly versionNumber: number;
  readonly sourceHash: string;
  readonly contentJson: string;
  readonly findings: readonly string[];
  readonly requiredSigners: readonly {
    appointmentId: string;
    role: ChampionshipOfficialRole;
    officialName: string;
  }[];
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface ResultsBookSignature {
  readonly id: string;
  readonly bookId: string;
  readonly appointmentId: string;
  readonly role: ChampionshipOfficialRole;
  readonly officialName: string;
  readonly statement: string;
  readonly signedAt: Date;
}

export interface ResultsBookFinalization {
  readonly id: string;
  readonly bookId: string;
  readonly sourceHash: string;
  readonly statement: string;
  readonly officialName: string;
  readonly finalizedAt: Date;
}

export interface ResultsBookBuildResult {
  readonly content: Readonly<Record<string, unknown>>;
  readonly findings: readonly string[];
  readonly sourceHash: string;
}

export interface ResultsBookProjectedResult {
  readonly resultId: string;
  readonly participantId: string;
  readonly rank: number;
  readonly playerName: string;
  readonly affiliation: string;
  readonly totalScore: number;
  readonly classificationCode: 'DSQ' | 'DQB' | 'AD_DSQ' | null;
  readonly status: 'published' | 'confirmed';
}

export interface ResultsBookResultSnapshot {
  readonly eventId: string;
  readonly resultScope: 'QUALIFICATION' | 'FINAL';
  readonly snapshotRevision: string;
  readonly officialPublicationRevision: string | null;
  readonly publicationIssues: readonly string[];
  readonly results: readonly ResultsBookProjectedResult[];
}

/** Replaceable bridge to the current official result projection. */
export interface IResultsBookResultSnapshotSource {
  load(eventId: string, resultScope: 'QUALIFICATION' | 'FINAL'): Promise<ResultsBookResultSnapshot>;
}

/** Optional provider of record candidates derived outside the individual result projection. */
export interface IResultsBookRecordCandidateSource {
  eligibleRecordResults(championshipId: string): Promise<readonly EligibleRecordResult[]>;
}

export interface ResultsBookQualificationTeamResult {
  readonly rank: number;
  readonly teamId: string;
  readonly teamName: string;
  readonly nationCode: string | null;
  readonly eligible: boolean;
  readonly totalScore: number;
  readonly members: readonly {
    readonly participantId: string;
    readonly playerName: string;
    readonly familyName: string;
    readonly nationCode: string | null;
    readonly gender: string;
    readonly entryStatus: string;
    readonly totalScore: number | null;
    readonly classificationCode: string | null;
    readonly decisionCount: number;
  }[];
}

/** Narrow bridge to the existing official three-member Team projection. */
export interface IResultsBookQualificationTeamSource {
  getQualification(eventId: string, format: 'THREE_MEMBER'): Promise<readonly ResultsBookQualificationTeamResult[]>;
}

/** Resolves the immutable workflow entry that made a result revision official. */
export interface IResultsBookOfficialRevisionSource {
  findOfficial(
    eventId: string,
    resultScope: 'QUALIFICATION' | 'FINAL',
  ): { readonly snapshotRevision: string; readonly approvalId: string } | null;
}

export interface IResultsBookSource {
  build(
    championshipId: string,
    officials: readonly ChampionshipOfficialEntry[],
    claims: readonly RecordClaim[],
  ): Promise<ResultsBookBuildResult>;
  eligibleRecordResults(championshipId: string): Promise<readonly EligibleRecordResult[]>;
}
