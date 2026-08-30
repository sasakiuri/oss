import type Database from 'better-sqlite3';
import type {
  IMixedTeamFinalResultRepository,
  MixedTeamFinalMemberResult,
  MixedTeamFinalResultRecord,
} from '../domain/IMixedTeamFinalResultRepository';

type Row = {
  id: string;
  event_id: string;
  source_competition_id: string;
  team_id: string;
  team_name: string;
  nation_code: string;
  member_results_json: string;
  stage1_total: number;
  stage2_total: number;
  total_score: number;
  final_rank: number;
  eliminated_at_shot: number | null;
  shootoff_id: string | null;
  remarks: string;
  created_at: string;
};

export class SqliteMixedTeamFinalResultRepository implements IMixedTeamFinalResultRepository {
  constructor(private readonly db: Database.Database) {}
  replaceByEvent(eventId: string, results: readonly MixedTeamFinalResultRecord[]): void {
    const insert = this.db.prepare(`INSERT INTO mixed_team_final_results (
      id, event_id, source_competition_id, team_id, team_name, nation_code, member_results_json,
      stage1_total, stage2_total, total_score, final_rank, eliminated_at_shot, shootoff_id, remarks, created_at
    ) VALUES (
      @id, @eventId, @sourceCompetitionId, @teamId, @teamName, @nationCode, @membersJson,
      @stage1Total, @stage2Total, @totalScore, @finalRank, @eliminatedAtShot, @shootoffId, @remarks, @createdAt
    )`);
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM mixed_team_final_results WHERE event_id = ?').run(eventId);
      results.forEach((result) => insert.run({ ...result, membersJson: JSON.stringify(result.members) }));
    })();
  }
  findByEvent(eventId: string): MixedTeamFinalResultRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM mixed_team_final_results WHERE event_id = ? ORDER BY final_rank, team_id')
        .all(eventId) as Row[]
    ).map((row) => ({
      id: row.id,
      eventId: row.event_id,
      sourceCompetitionId: row.source_competition_id,
      teamId: row.team_id,
      teamName: row.team_name,
      nationCode: row.nation_code,
      members: JSON.parse(row.member_results_json) as MixedTeamFinalMemberResult[],
      stage1Total: row.stage1_total,
      stage2Total: row.stage2_total,
      totalScore: row.total_score,
      finalRank: row.final_rank,
      eliminatedAtShot: row.eliminated_at_shot,
      shootoffId: row.shootoff_id,
      remarks: row.remarks,
      createdAt: row.created_at,
    }));
  }
}
