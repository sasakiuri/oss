import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { athleteSanctionsContract, type AthleteSanctionWorkspaceDto } from '@/shared/ipc/contracts';

import type { AthleteSanctionWorkspace } from './application/AthleteSanctionService';

export const athleteSanctionsModule: ModuleDefinition<
  'athleteSanctionService' | 'ipcRouter' | 'sanctionAuthorizationResolver'
> = {
  name: 'athlete-sanctions',
  deps: ['athleteSanctionService', 'ipcRouter', 'sanctionAuthorizationResolver'] as const,
  register({ athleteSanctionService, ipcRouter, sanctionAuthorizationResolver }) {
    ipcRouter.register(athleteSanctionsContract, {
      getWorkspace: async (input) => toWorkspaceDto(athleteSanctionService.getWorkspace(input.championshipId)),
      createIdentity: async (input) => toWorkspaceDto(athleteSanctionService.createIdentity(input)),
      linkParticipant: async (input) => toWorkspaceDto(athleteSanctionService.linkParticipant(input)),
      unlinkParticipant: async (input) => toWorkspaceDto(athleteSanctionService.unlinkParticipant(input)),
      synchronizeIssfIdentities: async (input) => {
        const result = athleteSanctionService.synchronizeIssfIdentities(input);
        return { ...result, workspace: toWorkspaceDto(result.workspace) };
      },
      imposeSanction: async (input) =>
        toWorkspaceDto(
          athleteSanctionService.imposeSanction({
            athleteIdentityId: input.athleteIdentityId,
            sourceEventId: input.sourceEventId,
            classificationCode: input.classificationCode,
            scope: input.scope,
            authorization: sanctionAuthorizationResolver.resolve(input),
            ruleReference: input.ruleReference,
            incidentReportNumber: input.incidentReportNumber,
            publicRemark: input.publicRemark,
            internalNote: input.internalNote,
            ...(input.decidedAt ? { decidedAt: new Date(input.decidedAt) } : {}),
          }),
        ),
      revokeSanction: async (input) =>
        toWorkspaceDto(
          athleteSanctionService.revokeSanction({
            decisionId: input.decisionId,
            authorization: sanctionAuthorizationResolver.resolve(input),
            ruleReference: input.ruleReference,
            reason: input.reason,
            internalNote: input.internalNote,
            ...(input.decidedAt ? { decidedAt: new Date(input.decidedAt) } : {}),
          }),
        ),
    });
  },
};

function toWorkspaceDto(workspace: AthleteSanctionWorkspace): AthleteSanctionWorkspaceDto {
  return {
    championshipId: workspace.championshipId,
    identities: workspace.identities.map((identity) => ({
      id: identity.id,
      championshipId: identity.championshipId,
      displayName: identity.displayName,
      issfId: identity.issfId,
      createdBy: identity.createdBy,
      creationStatement: identity.creationStatement,
      createdAt: identity.createdAt.toISOString(),
    })),
    participantEntries: [...workspace.participantEntries],
    linkHistory: workspace.linkHistory.map(toLinkDto),
    activeLinks: workspace.activeLinks.map(toLinkDto),
    sanctionHistory: workspace.sanctionHistory.map(toDecisionDto),
    activeSanctions: workspace.activeSanctions.map(toDecisionDto),
  };
}

function toLinkDto(link: AthleteSanctionWorkspace['linkHistory'][number]) {
  return {
    id: link.id,
    athleteIdentityId: link.athleteIdentityId,
    participantId: link.participantId,
    eventIdSnapshot: link.eventIdSnapshot,
    eventNameSnapshot: link.eventNameSnapshot,
    playerNameSnapshot: link.playerNameSnapshot,
    issfIdSnapshot: link.issfIdSnapshot,
    entryType: link.entryType,
    linkBasis: link.linkBasis,
    statement: link.statement,
    officialName: link.officialName,
    recordedAt: link.recordedAt.toISOString(),
    reversesLinkId: link.reversesLinkId,
  };
}

function toDecisionDto(decision: AthleteSanctionWorkspace['sanctionHistory'][number]) {
  return {
    id: decision.id,
    athleteIdentityId: decision.athleteIdentityId,
    sourceEventId: decision.sourceEventId,
    decisionType: decision.decisionType,
    classificationCode: decision.classificationCode,
    scope: decision.scope,
    authorityBasis: decision.authorization.basis,
    authorityReference: decision.authorization.authorityReference,
    officialName: decision.authorization.officialName,
    officialRole: decision.authorization.officialRole,
    officialActorId: decision.authorization.officialActorId,
    authorizationMode: decision.authorization.mode,
    ruleReference: decision.ruleReference,
    incidentReportNumber: decision.incidentReportNumber,
    publicRemark: decision.publicRemark,
    internalNote: decision.internalNote,
    decidedAt: decision.decidedAt.toISOString(),
    recordedAt: decision.recordedAt.toISOString(),
    reversesDecisionId: decision.reversesDecisionId,
  };
}
