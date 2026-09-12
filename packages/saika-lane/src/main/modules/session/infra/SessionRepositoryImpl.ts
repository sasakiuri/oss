// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';

import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { SessionStorageData } from '@/main/modules/session/domain/SessionFactory';
import { SessionFactory } from '@/main/modules/session/domain/SessionFactory';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { parseSessionStorageData } from './SessionStorageSchema';

/** Stores each session as one value through LocalStorageAdapter. */
export class SessionRepositoryImpl implements ISessionRepository {
  private static readonly STORAGE_PREFIX = 'session:';
  private static readonly ACTIVE_SESSION_KEY = 'session:active';

  constructor(private readonly storage: ILocalStorage) {
    Object.freeze(this);
  }

  async save(session: Session): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(session.id);
        const data = this.toStorageData(session);
        this.storage.set(key, data);

        // For an active session (finishedAt is null), also update the active key
        if (session.finishedAt === null) {
          this.storage.set(SessionRepositoryImpl.ACTIVE_SESSION_KEY, session.id);
        }
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: 'save' },
    );
  }

  async saveReset(session: Session): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        if (session.allShots.length !== 0 || session.finishedAt !== null)
          throw new Error('A reset must contain an active session with no shots');
        this.storage.setMany({
          [this.getStorageKey(session.id)]: this.toStorageData(session),
          [SessionRepositoryImpl.ACTIVE_SESSION_KEY]: session.id,
          [`session-reset-epoch:${session.id}`]: randomUUID(),
        });
      },
      'REPOSITORY_ERROR',
      { sessionId: session.id, operation: 'saveReset' },
    );
  }

  async readResetEpoch(sessionId: string): Promise<string | null> {
    return withRepositoryErrorHandling(
      async () => {
        const epoch = this.storage.get<unknown>(`session-reset-epoch:${sessionId}`);
        if (epoch === undefined) return null;
        if (typeof epoch !== 'string' || !epoch || epoch.length > 256) throw new Error('Invalid session reset epoch');
        return epoch;
      },
      'REPOSITORY_ERROR',
      { sessionId, operation: 'readResetEpoch' },
    );
  }

  /** Delegates to save(): LocalStorageAdapter stores the whole session as one value. */
  async saveShot(session: Session, _shot: Shot): Promise<void> {
    return this.save(session);
  }

  async findById(id: string): Promise<Session | null> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        const raw = this.storage.get<unknown>(key);

        if (!raw) {
          return null;
        }

        const data = parseSessionStorageData(raw);
        return this.toDomainEntity(data);
      },
      'REPOSITORY_ERROR',
      { sessionId: id, operation: 'findById' },
    );
  }

  async findAll(): Promise<Session[]> {
    return withRepositoryErrorHandling(
      async () => {
        const allData = this.storage.getAll();
        const sessions: Session[] = [];

        for (const [key, value] of Object.entries(allData)) {
          if (
            key.startsWith(SessionRepositoryImpl.STORAGE_PREFIX) &&
            key !== SessionRepositoryImpl.ACTIVE_SESSION_KEY
          ) {
            const data = parseSessionStorageData(value);
            sessions.push(this.toDomainEntity(data));
          }
        }

        return sessions;
      },
      'REPOSITORY_ERROR',
      { operation: 'findAll' },
    );
  }

  async delete(id: string): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        this.storage.delete(key);

        // If the active session was deleted, also clear the active key
        const activeId = this.storage.get<string>(SessionRepositoryImpl.ACTIVE_SESSION_KEY);
        if (activeId === id) {
          this.storage.delete(SessionRepositoryImpl.ACTIVE_SESSION_KEY);
        }
      },
      'REPOSITORY_ERROR',
      { sessionId: id, operation: 'delete' },
    );
  }

  async findActive(): Promise<Session | null> {
    return withRepositoryErrorHandling(
      async () => {
        const activeId = this.storage.get<string>(SessionRepositoryImpl.ACTIVE_SESSION_KEY);

        if (!activeId) {
          return null;
        }

        return await this.findById(activeId);
      },
      'REPOSITORY_ERROR',
      { operation: 'findActive' },
    );
  }

  private getStorageKey(id: string): string {
    return `${SessionRepositoryImpl.STORAGE_PREFIX}${id}`;
  }

  private toStorageData(session: Session): SessionStorageData {
    return {
      id: session.id,
      discipline: session.discipline.value,
      mode: session.mode.value,
      series: session.series.map((s) => ({
        seriesNumber: s.seriesNumber,
        totalScore: s.total,
      })),
      allShots: session.allShots.map((shot) => ({
        id: shot.id,
        shotNumber: shot.shotNumber,
        impactPoint:
          shot.impactPoint !== null
            ? {
                x: shot.impactPoint.x,
                y: shot.impactPoint.y,
              }
            : null,
        score: shot.score.value,
        innerTen: shot.innerTen,
        timestamp: shot.timestamp.toISOString(),
        seriesNumber: shot.seriesNumber,
        mode: shot.mode.value,
        deviceScore: shot.deviceScore?.value,
        calculatedScore: shot.calculatedScore.value,
        receivedAt: shot.receivedAt.toISOString(),
        sourceObservationId: shot.sourceObservationId,
        targetProfileId: shot.targetProfileId,
        scoringGaugeProfileId: shot.scoringGaugeProfileId,
      })),
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
      scoringMode: session.scoringMode,
    };
  }

  private toDomainEntity(data: SessionStorageData): Session {
    return SessionFactory.fromStorageData(data);
  }
}
