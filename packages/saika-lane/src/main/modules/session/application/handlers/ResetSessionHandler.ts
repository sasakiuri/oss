// SPDX-License-Identifier: MIT
import type { ResetSessionInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

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

    // Clear all shooting data while keeping the session context active.
    const updatedSession = session.reset();

    // The reset boundary and cleared history must survive or fail together.
    await sessionRepository.saveReset(updatedSession);

    // Emit SessionReset event
    eventBus.emit({
      type: 'SessionReset',
      timestamp: Date.now(),
      aggregateId: updatedSession.id,
    });
  };
}
