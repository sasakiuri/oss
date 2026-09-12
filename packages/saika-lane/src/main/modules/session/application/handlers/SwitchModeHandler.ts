// SPDX-License-Identifier: MIT
import type { SwitchModeInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

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
    const updatedSession = input.preserveSeries ? session.resumeMode(input.mode) : session.switchMode(input.mode);

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
