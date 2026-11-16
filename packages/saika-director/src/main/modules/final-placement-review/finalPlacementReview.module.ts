import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { finalPlacementReviewContract } from '@/shared/ipc/contracts';

import { FinalPlacementReviewService } from './application/FinalPlacementReviewService';

export const finalPlacementReviewModule = defineModule({
  name: 'finalPlacementReview',
  deps: ['ipcRouter', 'finalResultsReader', 'finalPlacementReviewRepository'],
  register({ ipcRouter, finalResultsReader, finalPlacementReviewRepository }) {
    const service = new FinalPlacementReviewService(finalResultsReader, finalPlacementReviewRepository);
    ipcRouter.register(finalPlacementReviewContract, {
      getStatus: ({ eventId }) => service.getStatus(eventId),
      record: (input) => service.record(input),
      revoke: (input) => service.revoke(input),
    });
  },
});
