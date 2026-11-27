import { sha256Json } from '@/main/domain/sha256Json';

import type {
  ChampionshipOfficialEntry,
  EligibleRecordResult,
  RecordClaim,
  ResultsBookBuildResult,
  ResultsBookProjectedResult,
} from './ResultsBookModels';
import { activeChampionshipOfficials, sameRecordCandidate, recordCandidateKey } from './ResultsBookPolicy';

export interface ResultsBookParticipant {
  readonly playerName: string;
  readonly familyName: string | null;
  readonly startNumber: string | null;
  readonly issfId: string | null;
  readonly nationCode: string | null;
}

export interface ResultsBookScheduleItem {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventType: string;
  readonly scheduledStartAt: string | null;
}

export interface ResultsBookResultView {
  readonly rank: number;
  readonly resultId: string;
  readonly participantId: string;
  readonly subjectKind: 'INDIVIDUAL' | 'MIXED_TEAM';
  readonly name: string;
  readonly familyName: string;
  readonly bibNumber: string | null;
  readonly issfId: string | null;
  readonly nationCode: string | null;
  readonly entryStatus: string;
  readonly totalScore: number;
  readonly classificationCode: ResultsBookProjectedResult['classificationCode'];
  readonly resultStatus: ResultsBookProjectedResult['status'];
  readonly remarks: string;
}

export interface ResultsBookEventProjection {
  readonly eventId: string;
  readonly eventName: string;
  readonly eventType: string;
  readonly rulePackId?: string | null;
  readonly rulePackFingerprint?: string | null;
  readonly scope: 'QUALIFICATION' | 'FINAL';
  readonly snapshotRevision: string | null;
  readonly officialPublicationRevision: string | null;
  readonly publicationCurrent: boolean;
  readonly projectionIssue: string | null;
  readonly results: readonly ResultsBookResultView[];
}

/** Everything a Results Book version is composed from, loaded for one championship. */
export interface ResultsBookFacts {
  readonly championship: Readonly<Record<string, unknown>>;
  readonly participants: readonly ResultsBookParticipant[];
  readonly schedule: readonly ResultsBookScheduleItem[];
  /** One projection per event, in event order. */
  readonly projections: readonly ResultsBookEventProjection[];
  readonly officials: readonly ChampionshipOfficialEntry[];
  readonly claims: readonly RecordClaim[];
  /** The current eligible record results; each claim must still match one of them. */
  readonly currentRecordResults: readonly EligibleRecordResult[];
}

/**
 * Composes the ISSF 6.14.4 Results Book content and its blocking findings. The content is hashed as
 * serialized, so its key order is part of the stored source hash.
 */
export function composeResultsBook(facts: ResultsBookFacts): ResultsBookBuildResult {
  const { championship, participants, schedule, projections, officials, claims } = facts;
  const medallists = projections.flatMap((event) =>
    event.results
      .filter((result) => result.rank >= 1 && result.rank <= 3)
      .map((result) => ({
        eventId: event.eventId,
        eventName: event.eventName,
        medal: result.rank === 1 ? 'GOLD' : result.rank === 2 ? 'SILVER' : 'BRONZE',
        name: result.name,
        nationCode: result.nationCode,
      })),
  );
  const medalMap = new Map<string, { nationCode: string; gold: number; silver: number; bronze: number }>();
  for (const medallist of medallists) {
    const nationCode = medallist.nationCode ?? '---';
    const row = medalMap.get(nationCode) ?? { nationCode, gold: 0, silver: 0, bronze: 0 };
    if (medallist.medal === 'GOLD') row.gold += 1;
    else if (medallist.medal === 'SILVER') row.silver += 1;
    else row.bronze += 1;
    medalMap.set(nationCode, row);
  }
  const entriesMap = new Map<string, { nationCode: string; athletes: Set<string>; entries: number }>();
  for (const participant of participants) {
    const nationCode = participant.nationCode ?? '---';
    const row = entriesMap.get(nationCode) ?? { nationCode, athletes: new Set<string>(), entries: 0 };
    row.athletes.add(participant.issfId ?? `${participant.familyName}:${participant.playerName}`);
    row.entries += 1;
    entriesMap.set(nationCode, row);
  }
  const content = {
    format: 'saika-issf-results-book',
    formatVersion: 1,
    ruleReference: 'ISSF 6.14.4',
    championship,
    tableOfContents: [
      'Results Certification',
      'Competition Officials',
      'Entries by Country',
      'Competition Schedule',
      'Medallists by Name',
      'Medals by Country',
      'New and Equalled Records',
      'Final Results',
    ],
    resultsCertification: { requiredRoles: ['TECHNICAL_DELEGATE', 'JURY_CHAIR'], signatures: [] },
    competitionOfficials: activeChampionshipOfficials(officials).map((entry) => ({
      role: entry.role,
      officialName: entry.officialName,
      organization: entry.organization,
    })),
    entriesByCountry: [...entriesMap.values()]
      .map((row) => ({
        nationCode: row.nationCode,
        athleteCount: row.athletes.size,
        entryCount: row.entries,
      }))
      .sort((left, right) => left.nationCode.localeCompare(right.nationCode)),
    competitionSchedule: schedule,
    medallistsByName: medallists,
    medalsByCountry: [...medalMap.values()]
      .map((row) => ({ ...row, total: row.gold + row.silver + row.bronze }))
      .sort((left, right) => right.gold - left.gold || right.silver - left.silver || right.bronze - left.bronze),
    newAndEqualledRecords: claims.map((claim) => ({
      code: claim.code,
      resultBasis: claim.resultBasis,
      eventName: claim.source.eventName,
      subjectKind: claim.source.subjectKind,
      subjectName: claim.source.subjectName,
      nationCode: claim.source.nationCode,
      scoreX10: claim.source.scoreX10,
      members: claim.source.members ?? [],
      achievedAt: claim.achievedAt.toISOString(),
      officialResultRevision: claim.source.snapshotRevision,
    })),
    finalResults: projections,
    nameFormat: 'FAMILY NAME, full Given name; Bib Number; IOC nation code',
    eventOrderBasis: 'Championship event sort order must be configured in ISSF 6.14.4(i) order',
  };
  const findings: string[] = [];
  if (projections.length === 0) findings.push('The championship has no events');
  for (const projection of projections) {
    if (projection.projectionIssue) {
      findings.push(`Event ${projection.eventName} result projection is unavailable: ${projection.projectionIssue}`);
    } else if (!projection.officialPublicationRevision) {
      findings.push(`Event ${projection.eventName} has no Official Final Results publication`);
    } else if (!projection.publicationCurrent) {
      findings.push(`Event ${projection.eventName} Official publication does not match the current result revision`);
    }
  }
  for (const participant of participants) {
    const missing = [
      !participant.familyName && 'family name',
      !participant.startNumber && 'Bib Number',
      !participant.nationCode && 'IOC nation code',
    ].filter(Boolean);
    if (missing.length > 0) findings.push(`Participant ${participant.playerName} is missing ${missing.join(', ')}`);
  }
  const currentByKey = new Map(
    facts.currentRecordResults.map((candidate) => [recordCandidateKey(candidate), candidate]),
  );
  for (const claim of claims) {
    const current = currentByKey.get(recordCandidateKey(claim.source));
    if (!current || !sameRecordCandidate(current, claim.source)) {
      findings.push(
        `Record claim ${claim.code} for ${claim.source.subjectName} is not based on the current Official result`,
      );
    }
  }
  return { content, findings: [...new Set(findings)], sourceHash: sha256Json(content) };
}
