import type { RulePackRegistry } from '@sasakiuri/saika-rules';
import { GetEventByIdToken, type GetEventByIdResponse } from '@/main/modules/championship';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { IResultPublicationPolicyResolver, ResultPublicationPolicy } from '../application/ResultPublicationPorts';
import type { ResultPublicationScope } from '../domain/ResultPublicationEntry';

/** Resolves publication timing by the version pinned to the event definition. */
export class RulePackResultPublicationPolicyResolver implements IResultPublicationPolicyResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly rulePacks: RulePackRegistry,
    private readonly fallback: ResultPublicationPolicy,
  ) {}

  async resolve(eventId: string, _resultScope: ResultPublicationScope): Promise<ResultPublicationPolicy> {
    const event = (await this.queryBus.execute(GetEventByIdToken, { eventId })) as GetEventByIdResponse | null;
    if (!event) throw new Error(`Event ${eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType);
    if (!definition.rulePackId) return this.fallback;
    const publication = this.rulePacks.getById(definition.rulePackId).capabilities.publication;
    if (!publication) return this.fallback;
    return { scoreProtestWindowMs: publication.scoreProtestWindowSeconds * 1000 };
  }
}
