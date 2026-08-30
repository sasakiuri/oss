import type Database from 'better-sqlite3';
import type { MixedTeamFinalDecisionDto } from '@/shared/ipc/contracts';
import type {
  IMixedTeamFinalControlRepository,
  MixedTeamFinalEntryInput,
} from '../domain/IMixedTeamFinalControlRepository';

type DecisionRow = {
  id: string;
  competition_id: string;
  event_id: string | null;
  competition_type_id: string;
  after_shot: number;
  rank: number;
  selected_team_id: string;
  member_lane_ids_json: string;
  score_snapshot_json: string;
  tied_team_ids_json: string;
  resolution: MixedTeamFinalDecisionDto['resolution'];
  resolution_statement: string | null;
  official_name: string;
  rule_reference: string;
  recorded_at: string;
};
type EntryRow = {
  id: string;
  decision_id: string;
  entry_type: 'COMMAND_BATCH' | 'VOID';
  command_results_json: string | null;
  statement: string;
  official_name: string;
  recorded_at: string;
};

export class SqliteMixedTeamFinalControlRepository implements IMixedTeamFinalControlRepository {
  constructor(private readonly db: Database.Database) {}
  appendDecision(
    decision: Omit<MixedTeamFinalDecisionDto, 'voided' | 'commandCompleted' | 'latestLaneStatuses' | 'commandAttempts'>,
  ): void {
    this.db
      .prepare(
        `INSERT INTO mixed_team_final_decisions (
      id, competition_id, event_id, competition_type_id, after_shot, rank, selected_team_id,
      member_lane_ids_json, score_snapshot_json, tied_team_ids_json, resolution, resolution_statement,
      official_name, rule_reference, recorded_at
    ) VALUES (
      @id, @competitionId, @eventId, @competitionTypeId, @afterShot, @rank, @selectedTeamId,
      @memberLaneIdsJson, @scoreSnapshotJson, @tiedTeamIdsJson, @resolution, @resolutionStatement,
      @officialName, @ruleReference, @recordedAt
    )`,
      )
      .run({
        ...decision,
        memberLaneIdsJson: JSON.stringify(decision.memberLaneIds),
        scoreSnapshotJson: JSON.stringify(decision.scoreSnapshot),
        tiedTeamIdsJson: JSON.stringify(decision.tiedTeamIds),
      });
  }
  appendEntry(input: MixedTeamFinalEntryInput): void {
    this.db
      .prepare(
        `INSERT INTO mixed_team_final_entries (
      id, decision_id, entry_type, command_results_json, statement, official_name, recorded_at
    ) VALUES (@id, @decisionId, @entryType, @commandResultsJson, @statement, @officialName, @recordedAt)`,
      )
      .run({ ...input, commandResultsJson: input.commandResults ? JSON.stringify(input.commandResults) : null });
  }
  findByCompetition(competitionId: string): MixedTeamFinalDecisionDto[] {
    return this.hydrate(
      this.db
        .prepare('SELECT * FROM mixed_team_final_decisions WHERE competition_id = ? ORDER BY recorded_at, rowid')
        .all(competitionId) as DecisionRow[],
    );
  }
  findById(id: string): MixedTeamFinalDecisionDto | null {
    const row = this.db.prepare('SELECT * FROM mixed_team_final_decisions WHERE id = ?').get(id) as
      DecisionRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }
  private hydrate(rows: DecisionRow[]): MixedTeamFinalDecisionDto[] {
    if (rows.length === 0) return [];
    const entries = this.db
      .prepare(
        `SELECT * FROM mixed_team_final_entries WHERE decision_id IN (${rows.map(() => '?').join(', ')}) ORDER BY recorded_at, rowid`,
      )
      .all(...rows.map((row) => row.id)) as EntryRow[];
    return rows.map((row) => {
      const history = entries.filter((entry) => entry.decision_id === row.id);
      const commandAttempts = history
        .filter((entry) => entry.entry_type === 'COMMAND_BATCH')
        .map((entry) => ({
          id: entry.id,
          laneResults: JSON.parse(
            entry.command_results_json!,
          ) as MixedTeamFinalDecisionDto['commandAttempts'][number]['laneResults'],
          statement: entry.statement,
          officialName: entry.official_name,
          recordedAt: entry.recorded_at,
        }));
      const latestLaneStatuses: Record<string, 'DONE' | 'ERROR' | 'TIMEOUT'> = {};
      for (const attempt of commandAttempts)
        for (const result of attempt.laneResults) latestLaneStatuses[result.laneId] = result.status;
      const memberLaneIds = JSON.parse(row.member_lane_ids_json) as string[];
      return {
        id: row.id,
        competitionId: row.competition_id,
        eventId: row.event_id,
        competitionTypeId: row.competition_type_id,
        afterShot: row.after_shot,
        rank: row.rank,
        selectedTeamId: row.selected_team_id,
        memberLaneIds: memberLaneIds as [string, string],
        scoreSnapshot: JSON.parse(row.score_snapshot_json) as MixedTeamFinalDecisionDto['scoreSnapshot'],
        tiedTeamIds: JSON.parse(row.tied_team_ids_json) as string[],
        resolution: row.resolution,
        resolutionStatement: row.resolution_statement,
        officialName: row.official_name,
        ruleReference: row.rule_reference,
        recordedAt: row.recorded_at,
        voided: history.some((entry) => entry.entry_type === 'VOID'),
        commandCompleted: memberLaneIds.every((laneId) => latestLaneStatuses[laneId] === 'DONE'),
        latestLaneStatuses,
        commandAttempts,
      };
    });
  }
}
