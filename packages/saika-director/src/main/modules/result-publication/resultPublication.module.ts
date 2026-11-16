import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { resultPublicationContract } from '@/shared/ipc/contracts';

import { ResultBoardSnapshotService } from './application/ResultBoardSnapshotService';
import { ResultPublicationService } from './application/ResultPublicationService';
import { toResultPublicationStatusDto } from './application/ResultPublicationDto';
import { readPublicationReviewSettings, writePublicationReviewSettings } from './application/publicationReviewSettings';

export const resultPublicationModule = defineModule({
  name: 'resultPublication',
  deps: [
    'appConfigService',
    'ipcRouter',
    'resultPublicationRepository',
    'resultPublicationReadiness',
    'resultPublicationPolicyResolver',
    'finalResultDeclarationService',
    'resultVerificationService',
  ],
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
    ipcRouter.register(resultPublicationContract, {
      getBoardSnapshot: ({ eventId, resultScope }) => boards.getSnapshot(eventId, resultScope),
      getReviewSettings: async () => readPublicationReviewSettings(appConfigService),
      setReviewSettings: async (input) => writePublicationReviewSettings(appConfigService, input),
      getStatus: async (input) =>
        toResultPublicationStatusDto(await service.getStatus(input.eventId, input.resultScope)),
      publishPreliminary: async (input) => toResultPublicationStatusDto(await service.publishPreliminary(input)),
      registerProtest: async (input) => toResultPublicationStatusDto(await service.registerProtest(input)),
      resolveProtest: async (input) => toResultPublicationStatusDto(await service.resolveProtest(input)),
      publishOfficial: async (input) => toResultPublicationStatusDto(await service.publishOfficial(input)),
      getFinalDeclarationStatus: ({ eventId }) => finalResultDeclarationService.getStatus(eventId),
      declareFinal: (input) => finalResultDeclarationService.declare(input),
    });
  },
});
