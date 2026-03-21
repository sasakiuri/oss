// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';

import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { SessionStorageData } from '@/main/modules/session/domain/SessionFactory';
import { SessionFactory } from '@/main/modules/session/domain/SessionFactory';
import { Shot } from '@/main/modules/session/domain/Shot';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';

/**
 * Type definitions for DB rows
 */
interface SessionRow {
  id: string;
  discipline: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  scoringMode: string;
}

interface ShotRow {
  id: string;
  sessionId: string;
  shotNumber: number;
  seriesNumber: number;
  impactPointX: number | null;
  impactPointY: number | null;
  score: number;
  innerTen: number;
  timestamp: string;
  mode: string;
  deviceScore: number | null;
}

/**
 * SqliteSessionRepository
 *
 * Repository implementation that persists session data to SQLite using better-sqlite3.
 * better-sqlite3 has a synchronous API, making it well-suited for use in the Electron Main process.
 */
export class SqliteSessionRepository implements ISessionRepository {
  private readonly stmtUpsertSession: Database.Statement;
  private readonly stmtUpsertShot: Database.Statement;
  private readonly stmtSelectSession: Database.Statement;
  private readonly stmtSelectAllSessions: Database.Statement;
  private readonly stmtSelectShots: Database.Statement;
  private readonly stmtDeleteSession: Database.Statement;
  private readonly stmtFindActiveSession: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtUpsertSession = db.prepare(`
      INSERT INTO sessions (id, discipline, mode, startedAt, finishedAt, scoringMode)
      VALUES (@id, @discipline, @mode, @startedAt, @finishedAt, @scoringMode)
      ON CONFLICT(id) DO UPDATE SET
        discipline = excluded.discipline,
        mode = excluded.mode,
        startedAt = excluded.startedAt,
        finishedAt = excluded.finishedAt,
        scoringMode = excluded.scoringMode
    `);

    this.stmtUpsertShot = db.prepare(`
      INSERT INTO shots (id, sessionId, shotNumber, seriesNumber, impactPointX, impactPointY, score, innerTen, timestamp, mode, deviceScore)
      VALUES (@id, @sessionId, @shotNumber, @seriesNumber, @impactPointX, @impactPointY, @score, @innerTen, @timestamp, @mode, @deviceScore)
      ON CONFLICT(id) DO UPDATE SET
        sessionId = excluded.sessionId,
        shotNumber = excluded.shotNumber,
        seriesNumber = excluded.seriesNumber,
        impactPointX = excluded.impactPointX,
        impactPointY = excluded.impactPointY,
        score = excluded.score,
        innerTen = excluded.innerTen,
        timestamp = excluded.timestamp,
        mode = excluded.mode,
        deviceScore = excluded.deviceScore
    `);

    this.stmtSelectSession = db.prepare(`
      SELECT id, discipline, mode, startedAt, finishedAt, scoringMode
      FROM sessions
      WHERE id = ?
    `);

    this.stmtSelectAllSessions = db.prepare(`
      SELECT id, discipline, mode, startedAt, finishedAt, scoringMode
      FROM sessions
      ORDER BY startedAt DESC
    `);

    this.stmtSelectShots = db.prepare(`
      SELECT id, sessionId, shotNumber, seriesNumber, impactPointX, impactPointY, score, innerTen, timestamp, mode, deviceScore
      FROM shots
      WHERE sessionId = ?
      ORDER BY shotNumber ASC
    `);

    this.stmtDeleteSession = db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `);

    this.stmtFindActiveSession = db.prepare(`
      SELECT id, discipline, mode, startedAt, finishedAt, scoringMode
      FROM sessions
      WHERE finishedAt IS NULL
      LIMIT 1
    `);
  }

  /**
   * Saves a session (UPSERT)
   *
   * @param session - Session to save
   * @throws REPOSITORY_ERROR - If the save fails
   */
  async save(session: Session): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const saveTransaction = this.db.transaction(() => {
          // UPSERT into the sessions table
          this.stmtUpsertSession.run({
            id: session.id,
            discipline: session.discipline.value,
            mode: session.mode.value,
            startedAt: session.startedAt.toISOString(),
            finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
            scoringMode: session.scoringMode,
          });

          // UPSERT into the shots table (all shots)
          for (const shot of session.allShots) {
            this.stmtUpsertShot.run({
              id: shot.id,
              sessionId: session.id,
              shotNumber: shot.shotNumber,
              seriesNumber: shot.seriesNumber,
              impactPointX: shot.impactPoint !== null ? shot.impactPoint.x : null,
              impactPointY: shot.impactPoint !== null ? shot.impactPoint.y : null,
              score: shot.score.value,
              innerTen: shot.innerTen ? 1 : 0,
              timestamp: shot.timestamp.toISOString(),
              mode: shot.mode.value,
              deviceScore: shot.deviceScore !== undefined ? shot.deviceScore.value : null,
            });
          }
        });

        saveTransaction();
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: 'save' },
    );
  }

  /**
   * Incrementally saves session metadata and a single shot (O(1) operation)
   *
   * Used in the hot path for shot recording. UPSERTs the sessions row
   * and UPSERTs only the specified single shot.
   *
   * @param session - Session to save (used for metadata updates)
   * @param shot - Newly added shot
   * @throws REPOSITORY_ERROR - If the save fails
   */
  async saveShot(session: Session, shot: Shot): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const saveShotTransaction = this.db.transaction(() => {
          // UPSERT into the sessions table
          this.stmtUpsertSession.run({
            id: session.id,
            discipline: session.discipline.value,
            mode: session.mode.value,
            startedAt: session.startedAt.toISOString(),
            finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
            scoringMode: session.scoringMode,
          });

          // UPSERT only the single shot
          this.stmtUpsertShot.run({
            id: shot.id,
            sessionId: session.id,
            shotNumber: shot.shotNumber,
            seriesNumber: shot.seriesNumber,
            impactPointX: shot.impactPoint !== null ? shot.impactPoint.x : null,
            impactPointY: shot.impactPoint !== null ? shot.impactPoint.y : null,
            score: shot.score.value,
            innerTen: shot.innerTen ? 1 : 0,
            timestamp: shot.timestamp.toISOString(),
            mode: shot.mode.value,
            deviceScore: shot.deviceScore !== undefined ? shot.deviceScore.value : null,
          });
        });

        saveShotTransaction();
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: 'saveShot' },
    );
  }

  /**
   * Retrieves a session by ID
   *
   * @param id - Session ID (UUID)
   * @returns Session if found, null if not found
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
  async findById(id: string): Promise<Session | null> {
    return withRepositoryErrorHandling(
      async () => {
        const sessionRow = this.stmtSelectSession.get(id) as SessionRow | undefined;

        if (!sessionRow) {
          return null;
        }

        return this.reconstructSession(sessionRow);
      },
      'REPOSITORY_ERROR',
      { sessionId: id, operation: 'findById' },
    );
  }

  /**
   * Retrieves all sessions
   *
   * @returns Array of sessions
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
  async findAll(): Promise<Session[]> {
    return withRepositoryErrorHandling(
      async () => {
        const sessionRows = this.stmtSelectAllSessions.all() as SessionRow[];
        return sessionRows.map((row) => this.reconstructSession(row));
      },
      'REPOSITORY_ERROR',
      { operation: 'findAll' },
    );
  }

  /**
   * Deletes a session
   *
   * @param id - ID of the session to delete (UUID)
   * @throws REPOSITORY_ERROR - If the deletion fails
   */
  async delete(id: string): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        // shots are also automatically deleted via ON DELETE CASCADE
        this.stmtDeleteSession.run(id);
      },
      'REPOSITORY_ERROR',
      { sessionId: id, operation: 'delete' },
    );
  }

  /**
   * Retrieves the currently active session (finishedAt IS NULL)
   *
   * @returns Session if an active session exists, null otherwise
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
  async findActive(): Promise<Session | null> {
    return withRepositoryErrorHandling(
      async () => {
        const sessionRow = this.stmtFindActiveSession.get() as SessionRow | undefined;

        if (!sessionRow) {
          return null;
        }

        return this.reconstructSession(sessionRow);
      },
      'REPOSITORY_ERROR',
      { operation: 'findActive' },
    );
  }

  /**
   * Retrieves shot data from DB rows, converts to SessionStorageData format, and reconstructs a Session
   *
   * @param sessionRow - Row from the sessions table
   * @returns Reconstructed Session instance
   */
  private reconstructSession(sessionRow: SessionRow): Session {
    const shotRows = this.stmtSelectShots.all(sessionRow.id) as ShotRow[];

    const allShotsData = shotRows.map((shot) => ({
      id: shot.id,
      shotNumber: shot.shotNumber,
      impactPoint:
        shot.impactPointX !== null && shot.impactPointY !== null
          ? { x: shot.impactPointX, y: shot.impactPointY }
          : null,
      score: shot.score,
      innerTen: shot.innerTen !== 0,
      timestamp: shot.timestamp,
      seriesNumber: shot.seriesNumber,
      mode: shot.mode,
      deviceScore: shot.deviceScore !== null ? shot.deviceScore : undefined,
    }));

    // Reconstruct series from shots where seriesNumber > 0 (Session invariant: sequential from 1)
    const seriesMap = new Map<number, number>();
    for (const shot of allShotsData) {
      if (shot.seriesNumber > 0) {
        const current = seriesMap.get(shot.seriesNumber) ?? 0;
        seriesMap.set(shot.seriesNumber, current + shot.score);
      }
    }
    // As a Session invariant, series must be sequential starting from 1.
    // If series numbers start from 2 or higher (e.g., when sighting series 1 is empty),
    // supplement with empty series to make them sequential.
    const maxSeriesNumber = seriesMap.size > 0 ? Math.max(...seriesMap.keys()) : 0;
    const series: Array<{ seriesNumber: number; totalScore: number }> = [];
    for (let i = 1; i <= maxSeriesNumber; i++) {
      series.push({ seriesNumber: i, totalScore: seriesMap.get(i) ?? 0 });
    }

    const storageData: SessionStorageData = {
      id: sessionRow.id,
      discipline: sessionRow.discipline,
      mode: sessionRow.mode,
      series,
      allShots: allShotsData,
      startedAt: sessionRow.startedAt,
      finishedAt: sessionRow.finishedAt,
      scoringMode:
        sessionRow.scoringMode === 'RING' || sessionRow.scoringMode === 'DECIMAL' ? sessionRow.scoringMode : 'DECIMAL',
    };

    return SessionFactory.fromStorageData(storageData);
  }
}
