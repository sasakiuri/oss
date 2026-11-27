import type { ResultScope } from '@/main/domain/resultScope';
import type Database from 'better-sqlite3';

import type {
  ChampionshipOfficialEntry,
  EligibleRecordResult,
  IResultsBookRecordCandidateSource,
  IResultsBookResultSnapshotSource,
  IResultsBookSource,
  RecordClaim,
  ResultsBookBuildResult,
  ResultsBookProjectedResult,
} from '../domain/ResultsBookModels';
import {
  composeResultsBook,
  type ResultsBookEventProjection,
  type ResultsBookResultView,
} from '../domain/composeResultsBook';
import { recordCandidateKey, sameRecordCandidate } from '../domain/ResultsBookPolicy';

interface EventRow {
  id: string;
  name: string;
  event_type: string;
  round: string;
  sort_order: number;
  rule_pack_id: string | null;
  rule_pack_fingerprint_sha256: string | null;
}

interface ParticipantRow {
  id: string;
  event_id: string;
  player_name: string;
  family_name: string | null;
  start_number: string | null;
  issf_id: string | null;
  nation_code: string | null;
  gender: string;
  entry_status: string;
}

interface ResultMetadataRow {
  result_id: string;
  subject_id: string;
  subject_kind: 'INDIVIDUAL' | 'MIXED_TEAM';
  official_name: string;
  official_family_name: string | null;
  start_number: string | null;
  issf_id: string | null;
  nation_code: string | null;
  entry_status: string;
  remarks: string;
}

/** SQLite metadata adapter; score and rank data arrive through a replaceable projection port. */
export class SqliteResultsBookSource implements IResultsBookSource {
  constructor(
    private readonly db: Database.Database,
    private readonly snapshots: IResultsBookResultSnapshotSource,
    private readonly additionalRecordCandidates: readonly IResultsBookRecordCandidateSource[] = [],
  ) {}

  async build(
    championshipId: string,
    officials: readonly ChampionshipOfficialEntry[],
    claims: readonly RecordClaim[],
  ): Promise<ResultsBookBuildResult> {
    const championship = this.db
      .prepare('SELECT id, name, date, venue FROM championships WHERE id = ?')
      .get(championshipId) as Record<string, unknown> | undefined;
    if (!championship) throw new Error(`Championship ${championshipId} not found`);
    const events = this.events(championshipId);
    const participants = this.db
      .prepare(
        `SELECT p.* FROM participants p JOIN events e ON e.id = p.event_id
         WHERE e.championship_id = ? ORDER BY e.sort_order, p.sort_order, p.id`,
      )
      .all(championshipId) as ParticipantRow[];
    const schedule = this.schedule(events);
    const projections = await Promise.all(events.map((event) => this.eventProjection(event)));
    return composeResultsBook({
      championship,
      participants: participants.map((participant) => ({
        playerName: participant.player_name,
        familyName: participant.family_name,
        startNumber: participant.start_number,
        issfId: participant.issf_id,
        nationCode: participant.nation_code,
      })),
      schedule,
      projections,
      officials,
      claims,
      currentRecordResults: claims.length === 0 ? [] : await this.eligibleRecordResults(championshipId),
    });
  }

  async eligibleRecordResults(championshipId: string): Promise<readonly EligibleRecordResult[]> {
    const events = this.events(championshipId);
    const inputs = events.flatMap((event) =>
      this.availableScopes(event.id).map((resultScope) => ({ event, resultScope })),
    );
    const loaded = await Promise.all(
      inputs.map(async ({ event, resultScope }) => {
        try {
          return { event, resultScope, snapshot: await this.snapshots.load(event.id, resultScope) };
        } catch {
          // A failed event projection must not hide appointments or other record workflows.
          // The same failure is reported as a blocking finding when a book is generated.
          return { event, resultScope, snapshot: null };
        }
      }),
    );
    const projected = loaded.flatMap(({ event, resultScope, snapshot }) => {
      if (
        !snapshot ||
        snapshot.publicationIssues.length > 0 ||
        snapshot.officialPublicationRevision !== snapshot.snapshotRevision
      ) {
        return [];
      }
      const metadata = this.resultMetadata(event.id, resultScope);
      return snapshot.results
        .filter((result) => result.rank > 0 && result.classificationCode === null)
        .map((result) => {
          const detail = metadata.get(result.resultId);
          return {
            eventId: event.id,
            eventName: event.name,
            resultScope,
            resultId: result.resultId,
            subjectKind: detail?.subject_kind ?? inferSubjectKind(result.participantId),
            subjectId: detail?.subject_id ?? result.participantId,
            subjectName: detail?.official_name ?? result.playerName,
            nationCode: detail?.nation_code ?? null,
            entryStatus: detail?.entry_status ?? 'COMPETING',
            scoreX10: Math.round(result.totalScore * 10),
            snapshotRevision: snapshot.snapshotRevision,
          } satisfies EligibleRecordResult;
        });
    });
    const additional = (
      await Promise.all(this.additionalRecordCandidates.map((source) => source.eligibleRecordResults(championshipId)))
    ).flat();
    return uniqueRecordCandidates([...projected, ...additional]);
  }

  private events(championshipId: string): EventRow[] {
    return this.db
      .prepare(
        'SELECT id, name, event_type, round, sort_order, rule_pack_id, rule_pack_fingerprint_sha256 FROM events WHERE championship_id = ? ORDER BY sort_order, id',
      )
      .all(championshipId) as EventRow[];
  }

  private schedule(events: readonly EventRow[]) {
    return events.map((event) => {
      const row = this.db
        .prepare(
          `SELECT scheduled_start_at FROM start_list_versions WHERE event_id = ?
           ORDER BY version_number DESC, rowid DESC LIMIT 1`,
        )
        .get(event.id) as { scheduled_start_at: string } | undefined;
      return {
        eventId: event.id,
        eventName: event.name,
        eventType: event.event_type,
        scheduledStartAt: row?.scheduled_start_at ?? null,
      };
    });
  }

  private async eventProjection(event: EventRow): Promise<ResultsBookEventProjection> {
    const scope = this.eventResultScope(event);
    try {
      const snapshot = await this.snapshots.load(event.id, scope);
      const metadata = this.resultMetadata(event.id, scope);
      return {
        eventId: event.id,
        eventName: event.name,
        eventType: event.event_type,
        scope,
        rulePackId: event.rule_pack_id,
        rulePackFingerprint: event.rule_pack_fingerprint_sha256,
        snapshotRevision: snapshot.snapshotRevision,
        officialPublicationRevision: snapshot.officialPublicationRevision,
        publicationCurrent:
          snapshot.publicationIssues.length === 0 && snapshot.officialPublicationRevision === snapshot.snapshotRevision,
        projectionIssue:
          snapshot.publicationIssues.length > 0
            ? `Official result has current publication blockers: ${snapshot.publicationIssues.join('; ')}`
            : null,
        results: [...snapshot.results]
          .sort(compareProjectedResults)
          .map((result) => resultView(result, metadata.get(result.resultId))),
      };
    } catch (error) {
      return {
        eventId: event.id,
        eventName: event.name,
        eventType: event.event_type,
        scope,
        snapshotRevision: null,
        officialPublicationRevision: null,
        publicationCurrent: false,
        projectionIssue: error instanceof Error ? error.message : String(error),
        results: [],
      };
    }
  }

  private eventResultScope(event: EventRow): ResultScope {
    if (event.round.toUpperCase().includes('FINAL') || this.hasRows('final_results', event.id)) return 'FINAL';
    if (this.hasRows('mixed_team_final_results', event.id)) return 'FINAL';
    return 'QUALIFICATION';
  }

  private availableScopes(eventId: string): Array<ResultScope> {
    const scopes: Array<ResultScope> = [];
    if (this.hasRows('results', eventId)) scopes.push('QUALIFICATION');
    if (this.hasRows('final_results', eventId) || this.hasRows('mixed_team_final_results', eventId)) {
      scopes.push('FINAL');
    }
    return scopes;
  }

  private hasRows(table: 'results' | 'final_results' | 'mixed_team_final_results', eventId: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM ${table} WHERE event_id = ? LIMIT 1`).get(eventId));
  }

  private resultMetadata(eventId: string, scope: ResultScope): Map<string, ResultMetadataRow> {
    const individualTable = scope === 'FINAL' ? 'final_results' : 'results';
    const individualRemarks = scope === 'FINAL' ? 'r.remarks' : "''";
    const rows = this.db
      .prepare(
        `SELECT r.id AS result_id, r.participant_id AS subject_id, 'INDIVIDUAL' AS subject_kind,
                p.player_name AS official_name, p.family_name AS official_family_name,
                p.start_number, p.issf_id, p.nation_code, p.entry_status,
                ${individualRemarks} AS remarks
         FROM ${individualTable} r JOIN participants p ON p.id = r.participant_id
         WHERE r.event_id = ?`,
      )
      .all(eventId) as ResultMetadataRow[];
    if (scope === 'FINAL') {
      rows.push(
        ...(this.db
          .prepare(
            `SELECT r.id AS result_id, r.team_id AS subject_id, 'MIXED_TEAM' AS subject_kind,
                    r.team_name AS official_name, NULL AS official_family_name,
                    NULL AS start_number, NULL AS issf_id, r.nation_code,
                    'COMPETING' AS entry_status, r.remarks
             FROM mixed_team_final_results r WHERE r.event_id = ?`,
          )
          .all(eventId) as ResultMetadataRow[]),
      );
    }
    return new Map(rows.map((row) => [row.result_id, row]));
  }
}

function resultView(
  result: ResultsBookProjectedResult,
  metadata: ResultMetadataRow | undefined,
): ResultsBookResultView {
  const name = metadata?.official_name ?? result.playerName;
  const familyName = metadata?.official_family_name ?? name;
  return {
    rank: result.rank,
    resultId: result.resultId,
    participantId: metadata?.subject_id ?? result.participantId,
    subjectKind: metadata?.subject_kind ?? inferSubjectKind(result.participantId),
    name,
    familyName: familyName.toUpperCase(),
    bibNumber: metadata?.start_number ?? null,
    issfId: metadata?.issf_id ?? null,
    nationCode: metadata?.nation_code ?? null,
    entryStatus: metadata?.entry_status ?? 'COMPETING',
    totalScore: result.totalScore,
    classificationCode: result.classificationCode,
    resultStatus: result.status,
    remarks: metadata?.remarks ?? '',
  };
}

function compareProjectedResults(left: ResultsBookProjectedResult, right: ResultsBookProjectedResult): number {
  const leftRank = left.rank > 0 ? left.rank : Number.MAX_SAFE_INTEGER;
  const rightRank = right.rank > 0 ? right.rank : Number.MAX_SAFE_INTEGER;
  return leftRank - rightRank || left.resultId.localeCompare(right.resultId);
}

function inferSubjectKind(participantId: string): 'INDIVIDUAL' | 'MIXED_TEAM' {
  return participantId.startsWith('TEAM:') ? 'MIXED_TEAM' : 'INDIVIDUAL';
}

function uniqueRecordCandidates(candidates: readonly EligibleRecordResult[]): EligibleRecordResult[] {
  const byKey = new Map<string, EligibleRecordResult>();
  for (const candidate of candidates) {
    const key = recordCandidateKey(candidate);
    const existing = byKey.get(key);
    if (existing && !sameRecordCandidate(existing, candidate)) {
      throw new Error(`Record candidate ${candidate.resultId} has conflicting sources`);
    }
    if (!existing) byKey.set(key, candidate);
  }
  return [...byKey.values()];
}
