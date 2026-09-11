import type Database from 'better-sqlite3';
import type { IFinalResultRepository } from '../domain/IFinalResultRepository';
import { FinalResult, type FinalResultStatus } from '../domain/FinalResult';
import { FinalResultId } from '../domain/FinalResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';

interface FinalResultRow {
  id: string;
  event_id: string;
  participant_id: string;
  player_name: string;
  affiliation: string;
  firing_point_number: number;
  stage1_shots: string;
  stage1_total: number;
  stage2_shots: string;
  stage2_total: number;
  total_score: number;
  final_rank: number;
  eliminated_at_shot: number | null;
  shootoff_id: string | null;
  remarks: string;
  status: FinalResultStatus;
  created_at: string;
  updated_at: string;
}

export class SqliteFinalResultRepository implements IFinalResultRepository {
  constructor(private readonly db: Database.Database) {}

  save(result: FinalResult, sourceCompetitionId?: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO final_results (
        id, event_id, participant_id, player_name, affiliation,
        firing_point_number, stage1_shots, stage1_total, stage2_shots, stage2_total,
        total_score, final_rank, eliminated_at_shot, shootoff_id, remarks, status,
        created_at, updated_at, source_competition_id
      )
      VALUES (
        @id, @eventId, @participantId, @playerName, @affiliation,
        @firingPointNumber, @stage1Shots, @stage1Total, @stage2Shots, @stage2Total,
        @totalScore, @finalRank, @eliminatedAtShot, @shootoffId, @remarks, @status,
        @createdAt, @updatedAt, @sourceCompetitionId
      )
      ON CONFLICT(id) DO UPDATE SET
        event_id = excluded.event_id,
        participant_id = excluded.participant_id,
        player_name = excluded.player_name,
        affiliation = excluded.affiliation,
        firing_point_number = excluded.firing_point_number,
        stage1_shots = excluded.stage1_shots,
        stage1_total = excluded.stage1_total,
        stage2_shots = excluded.stage2_shots,
        stage2_total = excluded.stage2_total,
        total_score = excluded.total_score,
        final_rank = excluded.final_rank,
        eliminated_at_shot = excluded.eliminated_at_shot,
        shootoff_id = excluded.shootoff_id,
        remarks = excluded.remarks,
        status = excluded.status,
        updated_at = excluded.updated_at,
        source_competition_id = COALESCE(excluded.source_competition_id, final_results.source_competition_id)
    `);

    const existing = this.findById(result.id.value);
    const createdAt = existing ? this.getCreatedAt(result.id.value) : now;

    stmt.run({
      id: result.id.value,
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      playerName: result.playerName,
      affiliation: result.affiliation,
      firingPointNumber: result.firingPointNumber,
      stage1Shots: JSON.stringify(result.stage1Shots),
      stage1Total: result.stage1Total,
      stage2Shots: JSON.stringify(result.stage2Shots),
      stage2Total: result.stage2Total,
      totalScore: result.totalScore,
      finalRank: result.finalRank,
      eliminatedAtShot: result.eliminatedAtShot ?? null,
      shootoffId: result.shootoffId ?? null,
      remarks: result.remarks,
      status: result.status,
      createdAt,
      updatedAt: now,
      sourceCompetitionId: sourceCompetitionId ?? null,
    });
  }

  findById(id: string): FinalResult | undefined {
    const stmt = this.db.prepare('SELECT * FROM final_results WHERE id = ?');
    const row = stmt.get(id) as FinalResultRow | undefined;
    if (!row) return undefined;
    return this.toEntity(row);
  }

  findByEventId(eventId: string): FinalResult[] {
    const stmt = this.db.prepare(
      'SELECT * FROM final_results WHERE event_id = ? ORDER BY final_rank ASC, total_score DESC',
    );
    const rows = stmt.all(eventId) as FinalResultRow[];
    return rows.map((row) => this.toEntity(row));
  }

  findByParticipantId(participantId: string): FinalResult | undefined {
    const stmt = this.db.prepare('SELECT * FROM final_results WHERE participant_id = ?');
    const row = stmt.get(participantId) as FinalResultRow | undefined;
    if (!row) return undefined;
    return this.toEntity(row);
  }

  updateStatus(id: string, status: FinalResultStatus): void {
    const stmt = this.db.prepare('UPDATE final_results SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, new Date().toISOString(), id);
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM final_results WHERE id = ?');
    stmt.run(id);
  }

  deleteByEventId(eventId: string): void {
    const stmt = this.db.prepare('DELETE FROM final_results WHERE event_id = ?');
    stmt.run(eventId);
  }

  executeInTransaction(fn: () => void): void {
    const transaction = this.db.transaction(() => {
      fn();
    });
    transaction();
  }

  private getCreatedAt(id: string): string {
    const stmt = this.db.prepare('SELECT created_at FROM final_results WHERE id = ?');
    const row = stmt.get(id) as { created_at: string } | undefined;
    return row?.created_at ?? new Date().toISOString();
  }

  private parseJsonArray(json: string, fieldName: string): number[] {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        throw new Error(`Expected array for ${fieldName}, got ${typeof parsed}`);
      }
      return parsed as number[];
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in ${fieldName}: ${error.message}`);
      }
      throw error;
    }
  }

  private toEntity(row: FinalResultRow): FinalResult {
    return FinalResult.reconstruct(
      FinalResultId.create(row.id),
      EventId.create(row.event_id),
      ParticipantId.create(row.participant_id),
      row.player_name,
      row.affiliation,
      row.firing_point_number,
      this.parseJsonArray(row.stage1_shots, 'stage1_shots'),
      row.stage1_total,
      this.parseJsonArray(row.stage2_shots, 'stage2_shots'),
      row.stage2_total,
      row.total_score,
      row.final_rank,
      row.eliminated_at_shot ?? undefined,
      row.shootoff_id ?? undefined,
      row.remarks,
      row.status,
    );
  }
}
