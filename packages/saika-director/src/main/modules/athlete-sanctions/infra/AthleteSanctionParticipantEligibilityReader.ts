import type {
  IParticipantEligibilityReader,
  ParticipantEligibilityAssessment,
} from '@/main/shared-infra/operations/ParticipantEligibility';

import type { IAthleteEntryReferenceSource } from '../application/AthleteEntryReferenceSource';
import { getActiveAthleteIdentityLinks } from '../domain/AthleteIdentityLink';
import type { IAthleteSanctionRepository } from '../domain/IAthleteSanctionRepository';
import { getActiveSanctionDecisions, selectEffectiveSanction } from '../domain/SanctionDecision';

/** Answers assignment eligibility from sanctions without exposing sanction storage to Lane modules. */
export class AthleteSanctionParticipantEligibilityReader implements IParticipantEligibilityReader {
  constructor(
    private readonly repository: IAthleteSanctionRepository,
    private readonly entries: IAthleteEntryReferenceSource,
  ) {}

  assess(participantId: string): ParticipantEligibilityAssessment {
    const participant = this.entries.findParticipant(participantId);
    if (!participant) return eligibleAssessment(participantId);

    const link = getActiveAthleteIdentityLinks(
      this.repository.findLinkEntriesByChampionship(participant.championshipId),
    ).find((candidate) => candidate.participantId === participantId);
    if (!link) return eligibleAssessment(participantId);

    const applicable = getActiveSanctionDecisions(
      this.repository.findDecisionsByChampionship(participant.championshipId),
    ).filter(
      (decision) =>
        decision.athleteIdentityId === link.athleteIdentityId &&
        (decision.scope === 'CHAMPIONSHIP' || decision.sourceEventId === participant.eventId),
    );
    const effective = selectEffectiveSanction(applicable);
    if (!effective) return eligibleAssessment(participantId);

    return {
      participantId,
      eligible: false,
      blockingCode: effective.classificationCode,
      decisionIds: applicable.map((decision) => decision.id),
      reason: effective.publicRemark,
    };
  }
}

function eligibleAssessment(participantId: string): ParticipantEligibilityAssessment {
  return { participantId, eligible: true, blockingCode: null, decisionIds: [], reason: null };
}
