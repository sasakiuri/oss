import type { IEventRepository } from '@/main/modules/championship';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

import type {
  IQualificationMalfunctionPolicyResolver,
  QualificationMalfunctionPolicyContext,
} from '../domain/IQualificationMalfunctionPolicyResolver';

export class RegistryQualificationMalfunctionPolicyResolver implements IQualificationMalfunctionPolicyResolver {
  constructor(
    private readonly events: IEventRepository,
    private readonly competitionTypes: CompetitionTypeRegistry,
  ) {}

  resolve(input: { eventId: string; stageIndex: number; seriesIndex: number }): QualificationMalfunctionPolicyContext {
    const event = this.events.findById(input.eventId);
    if (!event) throw new Error(`Event ${input.eventId} not found`);
    const definition = this.competitionTypes.get(event.eventType.value);
    const capability = definition.qualificationMalfunction;
    if (!capability) {
      throw new Error(`Competition type ${definition.id} has no qualification malfunction policy`);
    }
    assertCompatibleIdentity(event.rulePackIdentity, definition.rulePackIdentity ?? null);

    const stage = definition.config.stages[input.stageIndex];
    if (!stage) throw new Error(`Stage index ${input.stageIndex} is outside competition type ${definition.id}`);
    const series = stage.series[input.seriesIndex];
    if (!series) {
      throw new Error(`Series index ${input.seriesIndex} is outside stage ${stage.id ?? input.stageIndex}`);
    }
    const phase = stage.type === 'preparation' ? 'SIGHTING' : 'MATCH';
    const stageId = stage.id ?? null;
    if (phase === 'MATCH' && (!stageId || !capability.stages.some((rule) => rule.stageId === stageId))) {
      throw new Error(`Stage ${stageId ?? input.stageIndex} has no qualification malfunction treatment`);
    }

    return {
      competitionTypeId: definition.id,
      rulePackIdentity: event.rulePackIdentity,
      capability,
      phase,
      stageId,
      stageIndex: input.stageIndex,
      seriesIndex: input.seriesIndex,
      seriesShotLimit: series.shots === 0 ? null : series.shots,
      timedTargetProgramId:
        series.timedTargetProgramId ?? (phase === 'SIGHTING' ? stage.sightingTimedTargetProgramId : undefined) ?? null,
    };
  }
}

function assertCompatibleIdentity(
  eventIdentity: QualificationMalfunctionPolicyContext['rulePackIdentity'],
  definitionIdentity: QualificationMalfunctionPolicyContext['rulePackIdentity'],
): void {
  if (!eventIdentity) return;
  if (
    !definitionIdentity ||
    eventIdentity.id !== definitionIdentity.id ||
    eventIdentity.schemaVersion !== definitionIdentity.schemaVersion ||
    eventIdentity.fingerprint.value !== definitionIdentity.fingerprint.value
  ) {
    throw new Error('The event Rule Pack binding does not match the registered competition type');
  }
}
