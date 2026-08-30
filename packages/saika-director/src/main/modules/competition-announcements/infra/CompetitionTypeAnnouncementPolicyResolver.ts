import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  CompetitionAnnouncementPhase,
  ICompetitionAnnouncementPolicyResolver,
  ResolvedCompetitionAnnouncementPolicy,
} from '../application/CompetitionAnnouncementPorts';

/** Resolves application policy without exposing Rule Pack objects to the scheduler. */
export class CompetitionTypeAnnouncementPolicyResolver implements ICompetitionAnnouncementPolicyResolver {
  constructor(private readonly competitionTypes: CompetitionTypeRegistry) {}

  resolve(
    competitionTypeId: string,
    phase: CompetitionAnnouncementPhase,
  ): ResolvedCompetitionAnnouncementPolicy | null {
    if (!this.competitionTypes.has(competitionTypeId)) return null;
    const definition = this.competitionTypes.get(competitionTypeId);
    const policy = definition.timerAnnouncements;
    if (!policy) return null;
    return {
      ...(definition.rulePackId ? { rulePackId: definition.rulePackId } : {}),
      warningsAtRemainingSeconds:
        phase === 'PREPARATION' ? policy.preparationWarningsAtRemainingSeconds : policy.matchWarningsAtRemainingSeconds,
    };
  }
}
