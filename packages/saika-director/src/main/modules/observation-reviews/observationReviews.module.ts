import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { observationReviewsContract } from '@/shared/ipc/contracts';
export const observationReviewsModule = defineModule({
  name: 'observationReviews',
  deps: ['ipcRouter', 'observationReviewService'],
  register({ ipcRouter, observationReviewService: service }) {
    ipcRouter.register(observationReviewsContract, {
      listEvent: async ({ eventId, resultScope }) => service.listEvent(eventId, resultScope),
      list: async ({ competitionId }) => service.list(competitionId),
      record: async (input) => service.record(input),
    });
  },
});
