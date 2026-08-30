import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { resultPublicationContract, type ResultPublicationStatusDto } from '@/shared/ipc/contracts';
import { ResultPublicationService, type ResultPublicationView } from './application/ResultPublicationService';
import { FinalResultDeclarationService } from './application/FinalResultDeclarationService';
import type { ResultPublicationEntry } from './domain/ResultPublicationEntry';
import { SqliteFinalResultDeclarationRepository } from './infra/SqliteFinalResultDeclarationRepository';

export const resultPublicationModule: ModuleDefinition<
  | 'database'
  | 'ipcRouter'
  | 'resultPublicationRepository'
  | 'resultPublicationReadiness'
  | 'resultPublicationPolicyResolver'
> = {
  name: 'resultPublication',
  deps: [
    'database',
    'ipcRouter',
    'resultPublicationRepository',
    'resultPublicationReadiness',
    'resultPublicationPolicyResolver',
  ] as const,
  register({
    database,
    ipcRouter,
    resultPublicationRepository,
    resultPublicationReadiness,
    resultPublicationPolicyResolver,
  }) {
    const service = new ResultPublicationService(
      resultPublicationRepository,
      resultPublicationReadiness,
      resultPublicationPolicyResolver,
    );
    const finalDeclarations = new FinalResultDeclarationService(
      new SqliteFinalResultDeclarationRepository(database),
      resultPublicationReadiness,
    );
    ipcRouter.register(resultPublicationContract, {
      getStatus: async (input) => toDto(await service.getStatus(input.eventId, input.resultScope)),
      publishPreliminary: async (input) => toDto(await service.publishPreliminary(input)),
      registerProtest: async (input) => toDto(await service.registerProtest(input)),
      resolveProtest: async (input) => toDto(await service.resolveProtest(input)),
      publishOfficial: async (input) => toDto(await service.publishOfficial(input)),
      getFinalDeclarationStatus: ({ eventId }) => finalDeclarations.getStatus(eventId),
      declareFinal: (input) => finalDeclarations.declare(input),
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
