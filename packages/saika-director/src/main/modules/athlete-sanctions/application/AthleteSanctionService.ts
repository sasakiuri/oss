import { AthleteIdentity, normalizeIssfId } from '../domain/AthleteIdentity';
import {
  AthleteIdentityLinkEntry,
  getActiveAthleteIdentityLinks,
  type AthleteIdentityLinkBasis,
} from '../domain/AthleteIdentityLink';
import type { IAthleteSanctionRepository } from '../domain/IAthleteSanctionRepository';
import {
  getActiveSanctionDecisions,
  SanctionDecision,
  type SanctionAuthorization,
  type SanctionClassificationCode,
  type SanctionScope,
} from '../domain/SanctionDecision';
import type { AthleteEntryReference, IAthleteEntryReferenceSource } from './AthleteEntryReferenceSource';

export interface AthleteSanctionWorkspace {
  readonly championshipId: string;
  readonly identities: readonly AthleteIdentity[];
  readonly participantEntries: readonly AthleteEntryReference[];
  readonly linkHistory: readonly AthleteIdentityLinkEntry[];
  readonly activeLinks: readonly AthleteIdentityLinkEntry[];
  readonly sanctionHistory: readonly SanctionDecision[];
  readonly activeSanctions: readonly SanctionDecision[];
}

export class AthleteSanctionService {
  constructor(
    private readonly repository: IAthleteSanctionRepository,
    private readonly entries: IAthleteEntryReferenceSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  createIdentity(input: {
    championshipId: string;
    displayName: string;
    issfId?: string | null;
    participantIds: readonly string[];
    linkBasis: AthleteIdentityLinkBasis;
    statement: string;
    officialName: string;
  }): AthleteSanctionWorkspace {
    if (!this.entries.championshipExists(input.championshipId)) {
      throw new Error(`Championship ${input.championshipId} not found`);
    }
    const participantIds = uniqueNonEmpty(input.participantIds, 'participantIds');
    const participants = participantIds.map((id) => this.requireParticipantInChampionship(id, input.championshipId));
    const identity = AthleteIdentity.create({
      championshipId: input.championshipId,
      displayName: input.displayName,
      issfId: input.issfId,
      createdBy: input.officialName,
      creationStatement: input.statement,
      createdAt: this.now(),
    });
    this.assertLinksAvailable(participantIds, input.championshipId);
    participants.forEach((participant) => this.assertLinkBasis(identity, participant, input.linkBasis));

    this.repository.executeInTransaction(() => {
      this.repository.appendIdentity(identity);
      for (const participant of participants) {
        this.repository.appendLinkEntry(
          AthleteIdentityLinkEntry.link({
            athleteIdentityId: identity.id,
            participantId: participant.participantId,
            eventIdSnapshot: participant.eventId,
            eventNameSnapshot: participant.eventName,
            playerNameSnapshot: participant.playerName,
            issfIdSnapshot: participant.issfId,
            linkBasis: input.linkBasis,
            statement: input.statement,
            officialName: input.officialName,
            recordedAt: this.now(),
          }),
        );
      }
    });
    return this.getWorkspace(input.championshipId);
  }

  linkParticipant(input: {
    athleteIdentityId: string;
    participantId: string;
    linkBasis: AthleteIdentityLinkBasis;
    statement: string;
    officialName: string;
  }): AthleteSanctionWorkspace {
    const identity = this.requireIdentity(input.athleteIdentityId);
    const participant = this.requireParticipantInChampionship(input.participantId, identity.championshipId);
    this.assertLinksAvailable([input.participantId], identity.championshipId);
    this.assertLinkBasis(identity, participant, input.linkBasis);
    this.repository.appendLinkEntry(
      AthleteIdentityLinkEntry.link({
        athleteIdentityId: identity.id,
        participantId: participant.participantId,
        eventIdSnapshot: participant.eventId,
        eventNameSnapshot: participant.eventName,
        playerNameSnapshot: participant.playerName,
        issfIdSnapshot: participant.issfId,
        linkBasis: input.linkBasis,
        statement: input.statement,
        officialName: input.officialName,
        recordedAt: this.now(),
      }),
    );
    return this.getWorkspace(identity.championshipId);
  }

  unlinkParticipant(input: { linkId: string; statement: string; officialName: string }): AthleteSanctionWorkspace {
    const link = this.repository.findLinkEntryById(input.linkId);
    if (!link || link.entryType !== 'LINKED') throw new Error(`Athlete identity link ${input.linkId} not found`);
    const identity = this.requireIdentity(link.athleteIdentityId);
    const active = getActiveAthleteIdentityLinks(
      this.repository.findLinkEntriesByChampionship(identity.championshipId),
    );
    if (!active.some((candidate) => candidate.id === link.id)) {
      throw new Error(`Athlete identity link ${input.linkId} is no longer active`);
    }
    const activeSanctions = getActiveSanctionDecisions(
      this.repository.findDecisionsByChampionship(identity.championshipId),
    );
    if (activeSanctions.some((decision) => decision.athleteIdentityId === identity.id)) {
      throw new Error('An identity with an active sanction cannot be unlinked; revoke the sanction first');
    }
    this.repository.appendLinkEntry(
      AthleteIdentityLinkEntry.unlink(link, {
        statement: input.statement,
        officialName: input.officialName,
        recordedAt: this.now(),
      }),
    );
    return this.getWorkspace(identity.championshipId);
  }

  synchronizeIssfIdentities(input: { championshipId: string; statement: string; officialName: string }): {
    workspace: AthleteSanctionWorkspace;
    identitiesCreated: number;
    participantsLinked: number;
  } {
    if (!this.entries.championshipExists(input.championshipId)) {
      throw new Error(`Championship ${input.championshipId} not found`);
    }
    const workspace = this.getWorkspace(input.championshipId);
    const linkedParticipantIds = new Set(workspace.activeLinks.map((link) => link.participantId));
    const identityByIssfId = new Map(
      workspace.identities.flatMap((identity) => (identity.issfId ? [[identity.issfId, identity] as const] : [])),
    );
    const groups = new Map<string, AthleteEntryReference[]>();
    for (const participant of workspace.participantEntries) {
      const issfId = normalizeIssfId(participant.issfId);
      if (!issfId || linkedParticipantIds.has(participant.participantId)) continue;
      const group = groups.get(issfId) ?? [];
      group.push(participant);
      groups.set(issfId, group);
    }

    let identitiesCreated = 0;
    let participantsLinked = 0;
    this.repository.executeInTransaction(() => {
      for (const [issfId, participants] of groups) {
        let identity = identityByIssfId.get(issfId);
        if (!identity) {
          identity = AthleteIdentity.create({
            championshipId: input.championshipId,
            displayName: participants[0]!.playerName,
            issfId,
            createdBy: input.officialName,
            creationStatement: input.statement,
            createdAt: this.now(),
          });
          this.repository.appendIdentity(identity);
          identityByIssfId.set(issfId, identity);
          identitiesCreated += 1;
        }
        for (const participant of participants) {
          this.repository.appendLinkEntry(
            AthleteIdentityLinkEntry.link({
              athleteIdentityId: identity.id,
              participantId: participant.participantId,
              eventIdSnapshot: participant.eventId,
              eventNameSnapshot: participant.eventName,
              playerNameSnapshot: participant.playerName,
              issfIdSnapshot: participant.issfId,
              linkBasis: 'ISSF_ID',
              statement: input.statement,
              officialName: input.officialName,
              recordedAt: this.now(),
            }),
          );
          participantsLinked += 1;
        }
      }
    });
    return { workspace: this.getWorkspace(input.championshipId), identitiesCreated, participantsLinked };
  }

  imposeSanction(input: {
    athleteIdentityId: string;
    sourceEventId: string;
    classificationCode: SanctionClassificationCode;
    scope: SanctionScope;
    authorization: SanctionAuthorization;
    ruleReference: string;
    incidentReportNumber?: string | null;
    publicRemark: string;
    internalNote?: string | null;
    decidedAt?: Date;
  }): AthleteSanctionWorkspace {
    const identity = this.requireIdentity(input.athleteIdentityId);
    const sourceEvent = this.entries.findEvent(input.sourceEventId);
    if (!sourceEvent || sourceEvent.championshipId !== identity.championshipId) {
      throw new Error('Sanction source event must belong to the athlete identity Championship');
    }
    const activeLinks = getActiveAthleteIdentityLinks(
      this.repository.findLinkEntriesByChampionship(identity.championshipId),
    );
    const sourceParticipants = new Set(
      this.entries.findParticipantsByEvent(input.sourceEventId).map((participant) => participant.participantId),
    );
    if (
      !activeLinks.some((link) => link.athleteIdentityId === identity.id && sourceParticipants.has(link.participantId))
    ) {
      throw new Error('The athlete identity must be linked to a participant in the sanction source event');
    }
    const activeSanctions = getActiveSanctionDecisions(
      this.repository.findDecisionsByChampionship(identity.championshipId),
    );
    if (
      activeSanctions.some(
        (decision) =>
          decision.athleteIdentityId === identity.id &&
          decision.classificationCode === input.classificationCode &&
          decision.scope === input.scope &&
          (input.scope === 'CHAMPIONSHIP' || decision.sourceEventId === input.sourceEventId),
      )
    ) {
      throw new Error(`An active ${input.classificationCode} sanction already covers this scope`);
    }
    this.repository.appendDecision(
      SanctionDecision.impose({
        ...input,
        decidedAt: input.decidedAt ?? this.now(),
        recordedAt: this.now(),
      }),
    );
    return this.getWorkspace(identity.championshipId);
  }

  revokeSanction(input: {
    decisionId: string;
    authorization: SanctionAuthorization;
    ruleReference: string;
    reason: string;
    internalNote?: string | null;
    decidedAt?: Date;
  }): AthleteSanctionWorkspace {
    const decision = this.repository.findDecisionById(input.decisionId);
    if (!decision || decision.decisionType !== 'IMPOSED')
      throw new Error(`Sanction decision ${input.decisionId} not found`);
    const identity = this.requireIdentity(decision.athleteIdentityId);
    const active = getActiveSanctionDecisions(this.repository.findDecisionsByChampionship(identity.championshipId));
    if (!active.some((candidate) => candidate.id === decision.id)) {
      throw new Error(`Sanction decision ${input.decisionId} is no longer active`);
    }
    this.repository.appendDecision(
      SanctionDecision.revoke(decision, {
        authorization: input.authorization,
        ruleReference: input.ruleReference,
        reason: input.reason,
        internalNote: input.internalNote,
        decidedAt: input.decidedAt ?? this.now(),
        recordedAt: this.now(),
      }),
    );
    return this.getWorkspace(identity.championshipId);
  }

  getWorkspace(championshipId: string): AthleteSanctionWorkspace {
    if (!this.entries.championshipExists(championshipId)) throw new Error(`Championship ${championshipId} not found`);
    const identities = this.repository.findIdentitiesByChampionship(championshipId);
    const linkHistory = this.repository.findLinkEntriesByChampionship(championshipId);
    const sanctionHistory = this.repository.findDecisionsByChampionship(championshipId);
    return {
      championshipId,
      identities,
      participantEntries: this.entries.findParticipantsByChampionship(championshipId),
      linkHistory,
      activeLinks: getActiveAthleteIdentityLinks(linkHistory),
      sanctionHistory,
      activeSanctions: getActiveSanctionDecisions(sanctionHistory),
    };
  }

  private requireIdentity(id: string): AthleteIdentity {
    const identity = this.repository.findIdentityById(id);
    if (!identity) throw new Error(`Athlete identity ${id} not found`);
    return identity;
  }

  private requireParticipantInChampionship(participantId: string, championshipId: string): AthleteEntryReference {
    const participant = this.entries.findParticipant(participantId);
    if (!participant || participant.championshipId !== championshipId) {
      throw new Error(`Participant ${participantId} does not belong to Championship ${championshipId}`);
    }
    return participant;
  }

  private assertLinksAvailable(participantIds: readonly string[], championshipId: string): void {
    const activeByParticipant = new Map(
      getActiveAthleteIdentityLinks(this.repository.findLinkEntriesByChampionship(championshipId)).map((link) => [
        link.participantId,
        link,
      ]),
    );
    for (const participantId of participantIds) {
      if (activeByParticipant.has(participantId)) {
        throw new Error(`Participant ${participantId} already has an active athlete identity link`);
      }
    }
  }

  private assertLinkBasis(
    identity: AthleteIdentity,
    participant: AthleteEntryReference,
    basis: AthleteIdentityLinkBasis,
  ): void {
    if (basis !== 'ISSF_ID') return;
    if (!identity.issfId || normalizeIssfId(participant.issfId) !== identity.issfId) {
      throw new Error(`Participant ${participant.participantId} does not have the identity ISSF ID`);
    }
  }
}

function uniqueNonEmpty(values: readonly string[], name: string): string[] {
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  if (normalized.length === 0) throw new Error(`${name} must contain at least one value`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${name} must not contain duplicates`);
  return normalized;
}
