// SPDX-License-Identifier: MIT
import { Session } from '@/main/modules/session/domain/Session';
import { Shot } from '@/main/modules/session/domain/Shot';

/**
 * ISessionRepository (session repository) interface
 *
 * A repository interface that abstracts session persistence.
 * Implementations are provided in the Infrastructure layer; the Domain layer depends on this interface.
 */
export interface ISessionRepository {
  /**
   * Saves a session (full save including all shots)
   *
   * @param session - Session to save
   * @returns Promise (resolves on completion)
   */
  save(session: Session): Promise<void>;

  /**
   * Incrementally saves session metadata and a single shot
   *
   * Used in the hot path for shot recording. UPSERTs the session's sessions row
   * and INSERTs only the specified single shot. O(1) operation.
   *
   * @param session - Session to save (used for metadata updates)
   * @param shot - Newly added shot
   * @returns Promise (resolves on completion)
   */
  saveShot(session: Session, shot: Shot): Promise<void>;

  /**
   * Retrieves a session by ID
   *
   * @param id - Session ID (UUID)
   * @returns Promise (Session if found, null if not found)
   */
  findById(id: string): Promise<Session | null>;

  /**
   * Retrieves all sessions
   *
   * @returns Promise (array of sessions)
   */
  findAll(): Promise<Session[]>;

  /**
   * Deletes a session
   *
   * @param id - ID of the session to delete (UUID)
   * @returns Promise (resolves on completion)
   */
  delete(id: string): Promise<void>;

  /**
   * Retrieves the currently active session
   *
   * @returns Promise (Session if an active session exists, null otherwise)
   */
  findActive(): Promise<Session | null>;
}
