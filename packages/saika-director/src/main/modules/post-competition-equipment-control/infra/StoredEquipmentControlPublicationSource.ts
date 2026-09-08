import {
  getActiveAthleteIdentityLinks,
  getActiveSanctionDecisions,
  type IAthleteEntryReferenceSource,
  type IAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';

import type {
  EquipmentControlPublicationItem,
  IEquipmentControlPublicationSource,
} from '../application/EquipmentControlPublicationBlocker';
import type { IPostCompetitionEquipmentCheckRepository } from '../domain/IPostCompetitionEquipmentCheckRepository';
import { equipmentControlCheckStatus } from '../domain/PostCompetitionEquipmentCheck';

/** Joins existing ledgers at their read boundary without writing scores or creating sanctions. */
export class StoredEquipmentControlPublicationSource implements IEquipmentControlPublicationSource {
  constructor(
    private readonly checks: IPostCompetitionEquipmentCheckRepository,
    private readonly sanctions: IAthleteSanctionRepository,
    private readonly events: Pick<IAthleteEntryReferenceSource, 'findEvent'>,
  ) {}

  load(eventId: string): readonly EquipmentControlPublicationItem[] {
    const event = this.events.findEvent(eventId);
    if (!event) throw new Error(`Equipment review event ${eventId} not found`);
    const checks = this.checks.findByChampionship(event.championshipId).filter((check) => check.eventId === eventId);
    if (!checks.length) return [];
    const links = getActiveAthleteIdentityLinks(this.sanctions.findLinkEntriesByChampionship(event.championshipId));
    const decisions = this.sanctions.findDecisionsByChampionship(event.championshipId);
    const activeIds = new Set(getActiveSanctionDecisions(decisions).map((decision) => decision.id));

    return checks.map((check) => {
      const identities = links.filter((link) => link.participantId === check.participantId);
      const matching =
        identities.length === 1
          ? decisions.filter(
              (decision) =>
                decision.decisionType === 'IMPOSED' &&
                decision.athleteIdentityId === identities[0]!.athleteIdentityId &&
                decision.sourceEventId === eventId &&
                decision.authorization.authorityReference === `EQUIPMENT-CONTROL:${check.id}`,
            )
          : [];
      // An authorized revocation is a recorded adjudication, not a reason to recreate a DSQ.
      const disposition = matching.some((decision) => activeIds.has(decision.id))
        ? 'DISQUALIFIED'
        : matching.some((decision) =>
              decisions.some(
                (entry) =>
                  entry.decisionType === 'REVOKED' &&
                  entry.reversesDecisionId === decision.id &&
                  entry.athleteIdentityId === decision.athleteIdentityId &&
                  entry.sourceEventId === eventId,
              ),
            )
          ? 'REVOKED'
          : 'UNRESOLVED';
      return {
        checkId: check.id,
        athleteName: check.athleteName,
        status: equipmentControlCheckStatus(this.checks.findEntries(check.id)),
        disposition,
      };
    });
  }
}
