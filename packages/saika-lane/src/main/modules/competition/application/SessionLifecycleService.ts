// SPDX-License-Identifier: MIT
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * SessionLifecycleService
 *
 * Service that centralizes the common logic of:
 * finish old session → create new session → emit SessionStarted event.
 */
export class SessionLifecycleService {
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly eventBus: IEventBus,
  ) {}

  /**
   * Finishes the current session and creates a new session with the same discipline.
   * Emits a SessionStarted event and returns the new session ID.
   *
   * @param currentSessionId - The current session ID to finish
   * @returns The new session ID
   */
  async rotateSession(currentSessionId: string): Promise<string> {
    // 1. Finish the old session
    const oldSession = await this.sessionRepository.findById(currentSessionId);
    if (!oldSession) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND', { id: currentSessionId });
    }
    const finishedSession = oldSession.finish();
    await this.sessionRepository.save(finishedSession);

    // 2. Create a new session
    const newSession = Session.create(oldSession.discipline, oldSession.scoringMode);
    await this.sessionRepository.save(newSession);

    // 3. Emit SessionStarted event
    this.eventBus.emit({
      type: 'SessionStarted',
      timestamp: Date.now(),
      aggregateId: newSession.id,
      discipline: newSession.discipline,
    });

    return newSession.id;
  }
}
