import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { publicationReviewPolicyContract } from '@/shared/ipc/contracts';
import type { PublicationReviewPolicyService } from './application/PublicationReviewPolicyService';

export {
  PublicationReviewPolicyService,
  type IPublicationReviewPolicyRepository,
} from './application/PublicationReviewPolicyService';
export { PolicyBoundVerificationSource } from './application/PolicyBoundVerificationSource';
export { SqlitePublicationReviewPolicyRepository } from './infra/SqlitePublicationReviewPolicyRepository';

export function registerPublicationReviewPolicies(router: IpcRouter, service: PublicationReviewPolicyService) {
  router.register(publicationReviewPolicyContract, {
    get: async ({ eventId, resultScope }) => service.get(eventId, resultScope),
    save: async (input) => service.save(input),
  });
}
