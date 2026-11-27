// SPDX-License-Identifier: MIT
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { publicationReviewPolicyContract } from '@/shared/ipc/contracts';

export const publicationReviewPoliciesModule = defineModule({
  name: 'publicationReviewPolicies',
  deps: ['ipcRouter', 'publicationReviewPolicyService'],
  register({ ipcRouter, publicationReviewPolicyService: service }) {
    ipcRouter.register(publicationReviewPolicyContract, {
      get: async ({ eventId, resultScope }) => service.get(eventId, resultScope),
      save: async (input) => service.save(input),
    });
  },
});
