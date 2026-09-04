import type { IResultClassificationOverlaySource, ResultClassificationOverlay } from '@/main/modules/results';

import type { IAthleteEntryReferenceSource } from '../application/AthleteEntryReferenceSource';
import { getActiveAthleteIdentityLinks } from '../domain/AthleteIdentityLink';
import type { IAthleteSanctionRepository } from '../domain/IAthleteSanctionRepository';
import { getActiveSanctionDecisions, selectEffectiveSanction, type SanctionDecision } from '../domain/SanctionDecision';

/** Projects append-only sanctions through the result module's consumer-owned port. */
export class AthleteSanctionResultClassificationSource implements IResultClassificationOverlaySource {
  constructor(
    private readonly repository: IAthleteSanctionRepository,
    private readonly entries: IAthleteEntryReferenceSource,
  ) {}

  findByEventId(eventId: string): readonly ResultClassificationOverlay[] {
    const event = this.entries.findEvent(eventId);
    if (!event) return [];

    const identityByParticipant = new Map(
      getActiveAthleteIdentityLinks(this.repository.findLinkEntriesByChampionship(event.championshipId)).map((link) => [
        link.participantId,
        link.athleteIdentityId,
      ]),
    );
    const decisionsByIdentity = groupApplicableDecisions(
      getActiveSanctionDecisions(this.repository.findDecisionsByChampionship(event.championshipId)),
      eventId,
    );

    return this.entries.findParticipantsByEvent(eventId).flatMap((participant) => {
      const identityId = identityByParticipant.get(participant.participantId);
      const decisions = identityId ? decisionsByIdentity.get(identityId) : undefined;
      const effective = decisions ? selectEffectiveSanction(decisions) : null;
      if (!decisions || !effective) return [];

      const ordered = [...decisions].sort(compareDecisionOrder);
      return [
        {
          participantId: participant.participantId,
          classificationCode: effective.classificationCode,
          decisionIds: ordered.map((decision) => decision.id),
          publicRemarks: ordered.map((decision) => decision.publicRemark),
        },
      ];
    });
  }
}

function groupApplicableDecisions(
  decisions: readonly SanctionDecision[],
  eventId: string,
): ReadonlyMap<string, SanctionDecision[]> {
  const grouped = new Map<string, SanctionDecision[]>();
  for (const decision of decisions) {
    if (decision.scope === 'EVENT' && decision.sourceEventId !== eventId) continue;
    const values = grouped.get(decision.athleteIdentityId) ?? [];
    values.push(decision);
    grouped.set(decision.athleteIdentityId, values);
  }
  return grouped;
}

function compareDecisionOrder(left: SanctionDecision, right: SanctionDecision): number {
  return left.decidedAt.getTime() - right.decidedAt.getTime() || left.id.localeCompare(right.id);
}
