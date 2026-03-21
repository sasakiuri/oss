// SPDX-License-Identifier: MIT
import type { SwitchModeInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createSwitchModeHandler
 *
 * @description
 * Handler factory that processes the mode switch command.
 * Retrieves the session, switches the mode, saves it, and emits a ModeSwitched event.
 *
 * @example
 * ```typescript
 * const handler = createSwitchModeHandler(sessionRepository, eventBus);
 * await handler({ sessionId, mode: Mode.match() });
 * ```
 *
 * @param sessionRepository - Session repository
 * @param eventBus - Event bus
 * @returns CommandHandler<SwitchModeInput> - Command handler function
 */
export function createSwitchModeHandler(
  sessionRepository: ISessionRepository,
  eventBus: IEventBus,
): CommandHandler<SwitchModeInput> {
  return async (input) => {
    // Retrieve the session
    const session = await sessionRepository.findById(input.sessionId);
    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Retain the previous mode
    const previousMode = session.mode;

    // Switch the mode (a new session instance is returned)
    const updatedSession = session.switchMode(input.mode);

    // Persist the session
    await sessionRepository.save(updatedSession);

    // Emit ModeSwitched event
    eventBus.emit({
      type: 'ModeSwitched',
      timestamp: Date.now(),
      aggregateId: updatedSession.id,
      previousMode,
      newMode: input.mode,
    });
  };
}
