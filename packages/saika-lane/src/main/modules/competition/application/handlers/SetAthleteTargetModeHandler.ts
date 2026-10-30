// SPDX-License-Identifier: MIT
import type { SetAthleteTargetModeInput } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CompetitionStateDto } from '../dto';
import { toCompetitionStateDto } from '../toCompetitionStateDto';

export function createSetAthleteTargetModeHandler(
  competitions: ICompetitionRepository,
  events: IEventBus,
  interruptions: Pick<ICompetitionInterruptionControl, 'get'>,
  sessions: ISessionRepository,
): CommandHandler<SetAthleteTargetModeInput, CompetitionStateDto> {
  return async (input) => {
    const state = await competitions.findActive();
    if (!state) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    const session = await sessions.findById(state.sessionId);
    if (!session) throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    const updated = state.selectAthleteTargetMode(input, interruptions.get(state.id), session.allShots);
    await competitions.save(updated);
    const projection = toCompetitionStateDto(updated, session.allShots, interruptions.get(updated.id));
    events.emit({
      type: 'AthleteTargetModeChanged',
      aggregateId: updated.id,
      timestamp: Date.now(),
      newMode: Mode.fromValue(projection.athleteTargetControl!.effective),
    });
    return projection;
  };
}
