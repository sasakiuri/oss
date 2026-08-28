import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { finalPlacementReviewContract } from '@/shared/ipc/contracts';

import { FinalPlacementReviewService } from './application/FinalPlacementReviewService';

export const finalPlacementReviewModule: ModuleDefinition<
  'ipcRouter' | 'finalResultsReader' | 'finalPlacementReviewRepository'
> = {
  name: 'finalPlacementReview',
  deps: ['ipcRouter', 'finalResultsReader', 'finalPlacementReviewRepository'] as const,
  register({ ipcRouter, finalResultsReader, finalPlacementReviewRepository }) {
    const service = new FinalPlacementReviewService(finalResultsReader, finalPlacementReviewRepository);
    ipcRouter.register(finalPlacementReviewContract, {
      getStatus: ({ eventId }) => service.getStatus(eventId),
      record: (input) => service.record(input),
      revoke: (input) => service.revoke(input),
    });
  },
};
