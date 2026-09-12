// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';

import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { SessionStorageData } from '@/main/modules/session/domain/SessionFactory';
import { SessionFactory } from '@/main/modules/session/domain/SessionFactory';
import { Shot } from '@/main/modules/session/domain/Shot';
import { parseShotCompetitionContext } from '@/main/modules/session/domain/ShotCompetitionContext';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import {
  isScoringGaugeProfileId,
  isTargetScoringProfileId,
  type ScoringGaugeProfileId,
  type TargetScoringProfileId,
} from '@/shared/target';

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
  calculatedScore: number | null;
  receivedAt: string | null;
  observationId: string | null;
  targetProfileId: string | null;
  scoringGaugeProfileId: string | null;
  competitionContext: string | null;
}

/** Stores sessions and shots in SQLite. */
export class SqliteSessionRepository implements ISessionRepository {
  private readonly stmtUpsertSession: Database.Statement;
  private readonly stmtUpsertShot: Database.Statement;
  private readonly stmtSelectSession: Database.Statement;
  private readonly stmtSelectAllSessions: Database.Statement;
  private readonly stmtSelectShots: Database.Statement;
  private readonly stmtDeleteSessionShots: Database.Statement;
  private readonly stmtDeleteSession: Database.Statement;
  private readonly stmtFindActiveSession: Database.Statement;
  private readonly stmtUpsertResetEpoch: Database.Statement;
  private readonly stmtReadResetEpoch: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtUpsertResetEpoch = db.prepare(`
      INSERT INTO session_reset_epochs (session_id, epoch) VALUES (?, ?)
      ON CONFLICT(session_id) DO UPDATE SET epoch = excluded.epoch
    `);
    this.stmtReadResetEpoch = db.prepare('SELECT epoch FROM session_reset_epochs WHERE session_id = ?');
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
      INSERT INTO shots (
        id, sessionId, shotNumber, seriesNumber, impactPointX, impactPointY, score, innerTen,
        timestamp, mode, deviceScore, calculatedScore, receivedAt, observationId, targetProfileId,
        scoringGaugeProfileId, competitionContext
      )
      VALUES (
        @id, @sessionId, @shotNumber, @seriesNumber, @impactPointX, @impactPointY, @score, @innerTen,
        @timestamp, @mode, @deviceScore, @calculatedScore, @receivedAt, @observationId, @targetProfileId,
        @scoringGaugeProfileId, @competitionContext
      )
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
        deviceScore = excluded.deviceScore,
        calculatedScore = excluded.calculatedScore,
        receivedAt = excluded.receivedAt,
        observationId = excluded.observationId,
        targetProfileId = excluded.targetProfileId,
        scoringGaugeProfileId = excluded.scoringGaugeProfileId,
        competitionContext = excluded.competitionContext
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
      SELECT id, sessionId, shotNumber, seriesNumber, impactPointX, impactPointY, score, innerTen, timestamp, mode,
             deviceScore, calculatedScore, receivedAt, observationId, targetProfileId, scoringGaugeProfileId, competitionContext
      FROM shots
      WHERE sessionId = ?
        AND NOT EXISTS (
          SELECT 1
          FROM qualification_recovery_adjudication_shots recovery_shot
          WHERE recovery_shot.shot_id = shots.id
            AND recovery_shot.disposition = 'ANNULLED_ORIGINAL'
        )
      ORDER BY shotNumber ASC
    `);

    this.stmtDeleteSessionShots = db.prepare(`
      DELETE FROM shots
      WHERE sessionId = ?
        AND NOT EXISTS (
          SELECT 1
          FROM qualification_recovery_adjudication_shots recovery_shot
          WHERE recovery_shot.shot_id = shots.id
            AND recovery_shot.disposition = 'ANNULLED_ORIGINAL'
        )
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

  async save(session: Session): Promise<void> {
    return this.saveSession(session, false);
  }

  async saveReset(session: Session): Promise<void> {
    return this.saveSession(session, true);
  }

  async readResetEpoch(sessionId: string): Promise<string | null> {
    return withRepositoryErrorHandling(
      async () => {
        const row = this.stmtReadResetEpoch.get(sessionId) as { epoch: string } | undefined;
        return row?.epoch ?? null;
      },
      'REPOSITORY_ERROR',
      { sessionId, operation: 'readResetEpoch' },
    );
  }

  private async saveSession(session: Session, reset: boolean): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        if (reset && (session.allShots.length !== 0 || session.finishedAt !== null))
          throw new Error('A reset must contain an active session with no shots');
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

          // save() is a full replacement. Remove rows that are no longer
          // present before inserting the aggregate's current shot history.
          this.stmtDeleteSessionShots.run(session.id);

          // UPSERT into the shots table (all current shots)
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
              calculatedScore: shot.calculatedScore.value,
              receivedAt: shot.receivedAt.toISOString(),
              observationId: shot.sourceObservationId ?? null,
              targetProfileId: shot.targetProfileId ?? null,
              scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
              competitionContext: shot.competitionContext ? JSON.stringify(shot.competitionContext) : null,
            });
          }
          if (reset) this.stmtUpsertResetEpoch.run(session.id, randomUUID());
        });

        saveTransaction();
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: reset ? 'saveReset' : 'save' },
    );
  }

  /** Saves session metadata and this shot without rewriting the shot history. */
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
            calculatedScore: shot.calculatedScore.value,
            receivedAt: shot.receivedAt.toISOString(),
            observationId: shot.sourceObservationId ?? null,
            targetProfileId: shot.targetProfileId ?? null,
            scoringGaugeProfileId: shot.scoringGaugeProfileId ?? null,
            competitionContext: shot.competitionContext ? JSON.stringify(shot.competitionContext) : null,
          });
        });

        saveShotTransaction();
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: 'saveShot' },
    );
  }

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
      calculatedScore: shot.calculatedScore !== null ? shot.calculatedScore : undefined,
      receivedAt: shot.receivedAt ?? undefined,
      sourceObservationId: shot.observationId ?? undefined,
      targetProfileId: parseTargetProfileId(shot.targetProfileId),
      scoringGaugeProfileId: parseScoringGaugeProfileId(shot.scoringGaugeProfileId),
      competitionContext:
        shot.competitionContext === null ? undefined : parseShotCompetitionContext(JSON.parse(shot.competitionContext)),
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

function parseTargetProfileId(value: string | null): TargetScoringProfileId | undefined {
  if (value === null) return undefined;
  if (!isTargetScoringProfileId(value)) throw new Error(`Unknown persisted target scoring profile: ${value}`);
  return value;
}

function parseScoringGaugeProfileId(value: string | null): ScoringGaugeProfileId | undefined {
  if (value === null) return undefined;
  if (!isScoringGaugeProfileId(value)) throw new Error(`Unknown persisted scoring gauge profile: ${value}`);
  return value;
}
