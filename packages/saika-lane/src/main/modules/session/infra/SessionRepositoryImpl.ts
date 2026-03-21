// SPDX-License-Identifier: MIT
import { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { SessionStorageData } from '@/main/modules/session/domain/SessionFactory';
import { SessionFactory } from '@/main/modules/session/domain/SessionFactory';
import type { Shot } from '@/main/modules/session/domain/Shot';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import { ILocalStorage } from '@/shared/storage/ILocalStorage';

import { parseSessionStorageData } from './SessionStorageSchema';

/**
 * SessionRepositoryImpl
 *
 * Implementation class for the session repository.
 * Persists session data using LocalStorageAdapter.
 */
export class SessionRepositoryImpl implements ISessionRepository {
  private static readonly STORAGE_PREFIX = 'session:';
  private static readonly ACTIVE_SESSION_KEY = 'session:active';

  /**
   * Constructor
   *
   * @param storage - Local storage instance
   */
  constructor(private readonly storage: ILocalStorage) {
    Object.freeze(this);
  }

  /**
   * Saves a session
   *
   * @param session - Session to save
   * @returns Promise (resolves on completion)
   * @throws REPOSITORY_ERROR - If the save fails
   */
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

  /**
   * Incrementally saves session metadata and a single shot
   *
   * Since the LocalStorage implementation stores the entire session as a single value,
   * this delegates to save().
   *
   * @param session - Session to save
   * @param _shot - Newly added shot (unused in the LocalStorage implementation)
   * @returns Promise (resolves on completion)
   * @throws REPOSITORY_ERROR - If the save fails
   */
  async saveShot(session: Session, _shot: Shot): Promise<void> {
    return this.save(session);
  }

  /**
   * Retrieves a session by ID
   *
   * @param id - Session ID (UUID)
   * @returns Promise (Session if found, null if not found)
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
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

  /**
   * Retrieves all sessions
   *
   * @returns Promise (array of sessions)
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
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

  /**
   * Deletes a session
   *
   * @param id - ID of the session to delete (UUID)
   * @returns Promise (resolves on completion)
   * @throws REPOSITORY_ERROR - If the deletion fails
   */
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

  /**
   * Retrieves the currently active session
   *
   * @returns Promise (Session if an active session exists, null otherwise)
   * @throws REPOSITORY_ERROR - If the retrieval fails
   */
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

  /**
   * Generates a storage key
   *
   * @param id - Session ID
   * @returns Storage key
   */
  private getStorageKey(id: string): string {
    return `${SessionRepositoryImpl.STORAGE_PREFIX}${id}`;
  }

  /**
   * Converts a Session entity to storage data format
   *
   * @param session - Session entity
   * @returns Storage data
   */
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
      })),
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
      scoringMode: session.scoringMode,
    };
  }

  /**
   * Converts storage data to a Session entity
   *
   * @param data - Data retrieved from storage
   * @returns Session entity
   */
  private toDomainEntity(data: SessionStorageData): Session {
    return SessionFactory.fromStorageData(data);
  }
}
