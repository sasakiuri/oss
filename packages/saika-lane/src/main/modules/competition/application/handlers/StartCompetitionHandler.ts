// SPDX-License-Identifier: MIT
import type { StartCompetitionInput } from '@/main/composition/tokens';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { CompetitionTypeRegistry } from '@/main/modules/competition/domain/CompetitionTypeRegistry';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Session } from '@/main/modules/session/domain/Session';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createStartCompetitionHandler
 *
 * Handler factory for the start competition command.
 * 1. Retrieve CompetitionTypeDefinition from the registry
 * 2. Create a new Session
 * 3. Create CompetitionState
 * 4. Persist and emit events
 */
export function createStartCompetitionHandler(
  registry: CompetitionTypeRegistry,
  competitionRepository: ICompetitionRepository,
  sessionRepository: ISessionRepository,
  eventBus: IEventBus,
): CommandHandler<StartCompetitionInput, { competitionId: string; sessionId: string }> {
  return async (input) => {
    const definition = registry.get(input.competitionTypeId);
    if (!definition) {
      throw ErrorCatalog.createError('UNKNOWN_COMPETITION_TYPE', {
        typeId: input.competitionTypeId,
      });
    }

    // Clean up existing active competition
    const activeCompetition = await competitionRepository.findActive();
    if (activeCompetition) {
      const finished = activeCompetition.finish();
      await competitionRepository.save(finished);
    }

    // Clean up existing active session
    const activeSession = await sessionRepository.findActive();
    if (activeSession) {
      const finished = activeSession.finish();
      await sessionRepository.save(finished);
    }

    // Create Session (derived from definition's discipline and acc)
    const session = Session.create(Discipline.fromValue(definition.discipline), definition.config.acc);
    await sessionRepository.save(session);

    // Create CompetitionState
    const competitionId = crypto.randomUUID();
    const state = CompetitionState.create(competitionId, session.id, definition.config);
    await competitionRepository.save(state);

    // Emit events
    eventBus.emit({
      type: 'SessionStarted',
      timestamp: Date.now(),
      aggregateId: session.id,
      discipline: session.discipline,
    });

    eventBus.emit({
      type: 'CompetitionStarted',
      timestamp: Date.now(),
      aggregateId: competitionId,
      competitionTypeId: input.competitionTypeId,
      sessionId: session.id,
      config: definition.config,
    });

    return { competitionId, sessionId: session.id };
  };
}
