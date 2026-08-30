import type Database from 'better-sqlite3';
import type { FinalControlDecisionDto } from '@/shared/ipc/contracts';
import type { FinalControlEntryInput, IFinalControlRepository } from '../domain/IFinalControlRepository';

interface DecisionRow {
  id: string;
  competition_id: string;
  event_id: string | null;
  competition_type_id: string;
  participant_count: number;
  after_shot: number;
  rank: number;
  selected_lane_id: string;
  score_snapshot_json: string;
  tied_lane_ids_json: string;
  resolution: FinalControlDecisionDto['resolution'];
  resolution_statement: string | null;
  official_name: string;
  rule_reference: string;
  recorded_at: string;
}

interface EntryRow {
  id: string;
  decision_id: string;
  entry_type: 'COMMAND_RESULT' | 'VOID';
  command_id: string | null;
  command_status: 'DONE' | 'ERROR' | 'TIMEOUT' | null;
  statement: string;
  official_name: string;
  recorded_at: string;
}

export class SqliteFinalControlRepository implements IFinalControlRepository {
  constructor(private readonly db: Database.Database) {}

  appendDecision(decision: Omit<FinalControlDecisionDto, 'voided' | 'commandCompleted' | 'commandAttempts'>): void {
    this.db
      .prepare(
        `INSERT INTO final_control_decisions (
      id, competition_id, event_id, competition_type_id, participant_count, after_shot, rank,
      selected_lane_id, score_snapshot_json, tied_lane_ids_json, resolution, resolution_statement,
      official_name, rule_reference, recorded_at
    ) VALUES (
      @id, @competitionId, @eventId, @competitionTypeId, @participantCount, @afterShot, @rank,
      @selectedLaneId, @scoreSnapshotJson, @tiedLaneIdsJson, @resolution, @resolutionStatement,
      @officialName, @ruleReference, @recordedAt
    )`,
      )
      .run({
        ...decision,
        scoreSnapshotJson: JSON.stringify(decision.scoreSnapshot),
        tiedLaneIdsJson: JSON.stringify(decision.tiedLaneIds),
      });
  }

  appendEntry(input: FinalControlEntryInput): void {
    this.db
      .prepare(
        `INSERT INTO final_control_entries (
      id, decision_id, entry_type, command_id, command_status, statement, official_name, recorded_at
    ) VALUES (@id, @decisionId, @entryType, @commandId, @commandStatus, @statement, @officialName, @recordedAt)`,
      )
      .run(input);
  }

  findByCompetition(competitionId: string): FinalControlDecisionDto[] {
    const decisions = this.db
      .prepare('SELECT * FROM final_control_decisions WHERE competition_id = ? ORDER BY recorded_at, rowid')
      .all(competitionId) as DecisionRow[];
    return this.hydrate(decisions);
  }

  findById(id: string): FinalControlDecisionDto | null {
    const row = this.db.prepare('SELECT * FROM final_control_decisions WHERE id = ?').get(id) as
      DecisionRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }

  private hydrate(decisions: DecisionRow[]): FinalControlDecisionDto[] {
    if (decisions.length === 0) return [];
    const placeholders = decisions.map(() => '?').join(', ');
    const entries = this.db
      .prepare(`SELECT * FROM final_control_entries WHERE decision_id IN (${placeholders}) ORDER BY recorded_at, rowid`)
      .all(...decisions.map((decision) => decision.id)) as EntryRow[];
    const entriesByDecision = new Map<string, EntryRow[]>();
    for (const entry of entries) {
      const group = entriesByDecision.get(entry.decision_id) ?? [];
      group.push(entry);
      entriesByDecision.set(entry.decision_id, group);
    }
    return decisions.map((row) => {
      const history = entriesByDecision.get(row.id) ?? [];
      const attempts = history
        .filter((entry) => entry.entry_type === 'COMMAND_RESULT')
        .map((entry) => ({
          id: entry.id,
          commandId: entry.command_id!,
          status: entry.command_status!,
          statement: entry.statement,
          officialName: entry.official_name,
          recordedAt: entry.recorded_at,
        }));
      return {
        id: row.id,
        competitionId: row.competition_id,
        eventId: row.event_id,
        competitionTypeId: row.competition_type_id,
        participantCount: row.participant_count,
        afterShot: row.after_shot,
        rank: row.rank,
        selectedLaneId: row.selected_lane_id,
        scoreSnapshot: JSON.parse(row.score_snapshot_json) as FinalControlDecisionDto['scoreSnapshot'],
        tiedLaneIds: JSON.parse(row.tied_lane_ids_json) as string[],
        resolution: row.resolution,
        resolutionStatement: row.resolution_statement,
        officialName: row.official_name,
        ruleReference: row.rule_reference,
        recordedAt: row.recorded_at,
        voided: history.some((entry) => entry.entry_type === 'VOID'),
        commandCompleted: attempts.some((entry) => entry.status === 'DONE'),
        commandAttempts: attempts,
      };
    });
  }
}
