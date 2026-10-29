// SPDX-License-Identifier: MIT
import type { SetAthleteTargetModeInput } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { CompetitionStateDto } from '../dto';
import { toCompetitionStateDto } from '../toCompetitionStateDto';

export function createSetAthleteTargetModeHandler(
  competitions: ICompetitionRepository,
  events: IEventBus,
): CommandHandler<SetAthleteTargetModeInput, CompetitionStateDto> {
  return async (input) => {
    const state = await competitions.findActive();
    if (!state) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: input.competitionId });
    const updated = state.selectAthleteTargetMode(input);
    await competitions.save(updated);
    events.emit({
      type: 'AthleteTargetModeChanged',
      aggregateId: updated.id,
      timestamp: Date.now(),
      newMode: Mode.fromValue(input.mode),
    });
    return toCompetitionStateDto(updated);
  };
}
