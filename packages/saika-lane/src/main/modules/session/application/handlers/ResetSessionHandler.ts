// SPDX-License-Identifier: MIT
import type { ResetSessionInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createResetSessionHandler
 *
 * @description
 * Handler factory that processes the session reset command.
 * Retrieves the session, resets it, saves it, and emits a SessionReset event.
 *
 * @example
 * ```typescript
 * const handler = createResetSessionHandler(sessionRepository, eventBus);
 * await handler({ sessionId });
 * ```
 *
 * @param sessionRepository - Session repository
 * @param eventBus - Event bus
 * @returns CommandHandler<ResetSessionInput> - Command handler function
 */
export function createResetSessionHandler(
  sessionRepository: ISessionRepository,
  eventBus: IEventBus,
): CommandHandler<ResetSessionInput> {
  return async (input) => {
    // Retrieve the session
    const session = await sessionRepository.findById(input.sessionId);
    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Reset the session (a new session instance is returned)
    const updatedSession = session.resetSeries();

    // Persist the session
    await sessionRepository.save(updatedSession);

    // Emit SessionReset event
    eventBus.emit({
      type: 'SessionReset',
      timestamp: Date.now(),
      aggregateId: updatedSession.id,
    });
  };
}
