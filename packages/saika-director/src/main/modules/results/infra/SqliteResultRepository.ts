import type Database from 'better-sqlite3';
import type { IResultRepository } from '../domain/IResultRepository';
import { Result } from '../domain/Result';
import { ResultId } from '../domain/ResultId';
import { EventId, ParticipantId } from '@/main/modules/championship';

interface ResultRow {
  id: string;
  event_id: string;
  participant_id: string;
  player_name: string;
  affiliation: string;
  total_score: number;
  series1: number;
  series2: number;
  series3: number;
  series4: number;
  series5: number;
  series6: number;
  shots_detail: string;
  relay_number: number;
  confirmed_at: string;
  status: 'published' | 'confirmed';
  source_competition_id: string | null;
}

export class SqliteResultRepository implements IResultRepository {
  constructor(private readonly db: Database.Database) {}

  save(result: Result): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO results (
        id, event_id, participant_id, player_name, affiliation,
        total_score, series1, series2, series3, series4, series5, series6,
        shots_detail, relay_number, confirmed_at, status, source_competition_id
      )
      VALUES (
        @id, @eventId, @participantId, @playerName, @affiliation,
        @totalScore, @series1, @series2, @series3, @series4, @series5, @series6,
        @shotsDetail, @relayNumber, @confirmedAt, @status, @sourceCompetitionId
      )
    `);
    const seriesScores = result.seriesScores;
    stmt.run({
      id: result.id.value,
      eventId: result.eventId.value,
      participantId: result.participantId.value,
      playerName: result.playerName,
      affiliation: result.affiliation,
      totalScore: result.totalScore,
      series1: seriesScores[0] ?? 0,
      series2: seriesScores[1] ?? 0,
      series3: seriesScores[2] ?? 0,
      series4: seriesScores[3] ?? 0,
      series5: seriesScores[4] ?? 0,
      series6: seriesScores[5] ?? 0,
      shotsDetail: JSON.stringify(result.shots),
      relayNumber: result.relayNumber,
      confirmedAt: result.confirmedAt.toISOString(),
      status: result.status,
      sourceCompetitionId: result.sourceCompetitionId,
    });
  }

  replaceByCompetitionId(eventId: string, relayNumber: number, competitionId: string, results: Result[]): void {
    for (const result of results) {
      if (result.sourceCompetitionId !== null && result.sourceCompetitionId !== competitionId) {
        throw new Error(
          `Result ${result.id.value} belongs to competition ${result.sourceCompetitionId}, not ${competitionId}`,
        );
      }
    }

    const deleteStatement = this.db.prepare(
      'DELETE FROM results WHERE event_id = ? AND relay_number = ? AND source_competition_id = ?',
    );
    const transaction = this.db.transaction((items: Result[]) => {
      deleteStatement.run(eventId, relayNumber, competitionId);
      for (const result of items) {
        this.save(result);
      }
    });
    transaction(results);
  }

  findById(id: string): Result | null {
    const stmt = this.db.prepare('SELECT * FROM results WHERE id = ?');
    const row = stmt.get(id) as ResultRow | undefined;
    if (!row) return null;
    return this.toEntity(row);
  }

  findByEventId(eventId: string): Result[] {
    const stmt = this.db.prepare('SELECT * FROM results WHERE event_id = ? ORDER BY total_score DESC');
    const rows = stmt.all(eventId) as ResultRow[];
    return rows.map((row) => this.toEntity(row));
  }

  findByParticipantId(participantId: string): Result | null {
    const stmt = this.db.prepare('SELECT * FROM results WHERE participant_id = ?');
    const row = stmt.get(participantId) as ResultRow | undefined;
    if (!row) return null;
    return this.toEntity(row);
  }

  deleteById(id: string): void {
    const stmt = this.db.prepare('DELETE FROM results WHERE id = ?');
    stmt.run(id);
  }

  deleteByEventId(eventId: string): void {
    const stmt = this.db.prepare('DELETE FROM results WHERE event_id = ?');
    stmt.run(eventId);
  }

  findByEventIdAndRelay(eventId: string, relayNumber: number): Result[] {
    const stmt = this.db.prepare(
      'SELECT * FROM results WHERE event_id = ? AND relay_number = ? ORDER BY total_score DESC',
    );
    const rows = stmt.all(eventId, relayNumber) as ResultRow[];
    return rows.map((row) => this.toEntity(row));
  }

  findByCompetitionId(eventId: string, relayNumber: number, competitionId: string): Result[] {
    const stmt = this.db.prepare(
      `SELECT * FROM results
       WHERE event_id = ? AND relay_number = ? AND source_competition_id = ?
       ORDER BY total_score DESC`,
    );
    const rows = stmt.all(eventId, relayNumber, competitionId) as ResultRow[];
    return rows.map((row) => this.toEntity(row));
  }

  updateStatus(resultIds: string[], status: 'published' | 'confirmed'): void {
    if (resultIds.length === 0) return;

    const placeholders = resultIds.map(() => '?').join(', ');
    const stmt = this.db.prepare(`UPDATE results SET status = ? WHERE id IN (${placeholders})`);
    stmt.run(status, ...resultIds);
  }

  private toEntity(row: ResultRow): Result {
    return Result.reconstructFromJson(
      ResultId.reconstruct(row.id),
      EventId.reconstruct(row.event_id),
      ParticipantId.reconstruct(row.participant_id),
      row.player_name,
      row.affiliation,
      row.total_score,
      [row.series1, row.series2, row.series3, row.series4, row.series5, row.series6],
      row.shots_detail,
      row.relay_number,
      new Date(row.confirmed_at),
      row.status,
      row.source_competition_id,
    );
  }
}
