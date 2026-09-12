// SPDX-License-Identifier: MIT
import type { StartSessionInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

export function createStartSessionHandler(
  sessionRepository: ISessionRepository,
  eventBus: IEventBus,
): CommandHandler<StartSessionInput> {
  return async (input) => {
    // Create a new session
    const session = Session.create(input.discipline);

    // Persist the session
    await sessionRepository.save(session);

    // Emit SessionStarted event
    eventBus.emit({
      type: 'SessionStarted',
      timestamp: Date.now(),
      aggregateId: session.id,
      discipline: session.discipline,
    });
  };
}
