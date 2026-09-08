import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { resultPublicationContract, type ResultPublicationStatusDto } from '@/shared/ipc/contracts';

import { ResultBoardSnapshotService } from './application/ResultBoardSnapshotService';
import { ResultPublicationService, type ResultPublicationView } from './application/ResultPublicationService';
import type { ResultPublicationEntry } from './domain/ResultPublicationEntry';

export const resultPublicationModule: ModuleDefinition<
  | 'appConfigService'
  | 'ipcRouter'
  | 'resultPublicationRepository'
  | 'resultPublicationReadiness'
  | 'resultPublicationPolicyResolver'
  | 'finalResultDeclarationService'
  | 'resultVerificationService'
> = {
  name: 'resultPublication',
  deps: [
    'appConfigService',
    'ipcRouter',
    'resultPublicationRepository',
    'resultPublicationReadiness',
    'resultPublicationPolicyResolver',
    'finalResultDeclarationService',
    'resultVerificationService',
  ] as const,
  register({
    appConfigService,
    ipcRouter,
    resultPublicationRepository,
    resultPublicationReadiness,
    resultPublicationPolicyResolver,
    finalResultDeclarationService,
    resultVerificationService,
  }) {
    const service = new ResultPublicationService(
      resultPublicationRepository,
      resultPublicationReadiness,
      resultPublicationPolicyResolver,
    );
    const boards = new ResultBoardSnapshotService(resultVerificationService, service, finalResultDeclarationService);
    const getReviewSettings = () => ({
      requireObservationReviews: appConfigService.get('resultPublication.requireObservationReviews'),
      requireIncidentReports: appConfigService.get('resultPublication.requireIncidentReports'),
      requireFinalRecoveriesComplete: appConfigService.get('resultPublication.requireFinalRecoveriesComplete'),
      requireProtestCasesComplete: appConfigService.get('resultPublication.requireProtestCasesComplete'),
      requireEquipmentChecksComplete: appConfigService.get('resultPublication.requireEquipmentChecksComplete'),
    });
    ipcRouter.register(resultPublicationContract, {
      getBoardSnapshot: ({ eventId, resultScope }) => boards.getSnapshot(eventId, resultScope),
      getReviewSettings: async () => getReviewSettings(),
      setReviewSettings: async (input) => {
        appConfigService.setMany({
          'resultPublication.requireObservationReviews': input.requireObservationReviews,
          'resultPublication.requireIncidentReports': input.requireIncidentReports,
          'resultPublication.requireFinalRecoveriesComplete': input.requireFinalRecoveriesComplete,
          'resultPublication.requireProtestCasesComplete': input.requireProtestCasesComplete,
          'resultPublication.requireEquipmentChecksComplete': input.requireEquipmentChecksComplete,
        });
        return getReviewSettings();
      },
      getStatus: async (input) => toDto(await service.getStatus(input.eventId, input.resultScope)),
      publishPreliminary: async (input) => toDto(await service.publishPreliminary(input)),
      registerProtest: async (input) => toDto(await service.registerProtest(input)),
      resolveProtest: async (input) => toDto(await service.resolveProtest(input)),
      publishOfficial: async (input) => toDto(await service.publishOfficial(input)),
      getFinalDeclarationStatus: ({ eventId }) => finalResultDeclarationService.getStatus(eventId),
      declareFinal: (input) => finalResultDeclarationService.declare(input),
    });
  },
};

function toDto(view: ResultPublicationView): ResultPublicationStatusDto {
  return {
    eventId: view.eventId,
    resultScope: view.resultScope,
    status: view.status,
    preliminaryId: view.preliminaryId,
    publicationSnapshotRevision: view.publicationSnapshotRevision,
    currentSnapshotRevision: view.currentSnapshotRevision,
    publicationCurrent: view.publicationCurrent,
    postedAt: view.postedAt?.toISOString() ?? null,
    protestEndsAt: view.protestEndsAt?.toISOString() ?? null,
    openProtestReferences: [...view.openProtestReferences],
    officialPublishedAt: view.officialPublishedAt?.toISOString() ?? null,
    approvalId: view.approvalId,
    canRegisterProtest: view.canRegisterProtest,
    canPublishOfficial: view.canPublishOfficial,
    issues: [...view.issues],
    history: view.history.map(toEntryDto),
  };
}

function toEntryDto(entry: ResultPublicationEntry): ResultPublicationStatusDto['history'][number] {
  const base = {
    id: entry.id,
    eventId: entry.eventId,
    resultScope: entry.resultScope,
    preliminaryId: entry.preliminaryId,
    recordedAt: entry.recordedAt.toISOString(),
  };
  switch (entry.type) {
    case 'PRELIMINARY_PUBLISHED':
      return {
        ...base,
        type: entry.type,
        snapshotRevision: entry.snapshotRevision,
        postingLocation: entry.postingLocation,
        postingReference: entry.postingReference,
        postedAt: entry.postedAt.toISOString(),
        protestEndsAt: entry.protestEndsAt.toISOString(),
        officialName: entry.officialName,
      };
    case 'PROTEST_REGISTERED':
      return { ...base, type: entry.type, protestReference: entry.protestReference };
    case 'PROTEST_RESOLVED':
      return {
        ...base,
        type: entry.type,
        protestReference: entry.protestReference,
        resolution: entry.resolution,
        officialName: entry.officialName,
      };
    case 'OFFICIAL_PUBLISHED':
      return {
        ...base,
        type: entry.type,
        snapshotRevision: entry.snapshotRevision,
        approvalId: entry.approvalId,
        officialName: entry.officialName,
      };
  }
}
