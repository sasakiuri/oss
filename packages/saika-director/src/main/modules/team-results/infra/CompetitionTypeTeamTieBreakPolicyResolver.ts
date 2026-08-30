import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

import type { ITeamTieBreakPolicyResolver } from '../application/TeamResultPorts';
import type { TeamTieBreakPolicy } from '../domain/TeamResultPolicy';

/** Adapts the competition definition pinned to an event into a team-ranking policy. */
export class CompetitionTypeTeamTieBreakPolicyResolver implements ITeamTieBreakPolicyResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly fallback: TeamTieBreakPolicy = 'ISSF_FULL_RING',
  ) {}

  async resolve(eventId: string): Promise<TeamTieBreakPolicy> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    return this.competitionTypes.get(event.eventType).resultFormat.tieBreakPolicy ?? this.fallback;
  }
}
