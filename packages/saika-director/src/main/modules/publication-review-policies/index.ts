import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { publicationReviewPolicyContract } from '@/shared/ipc/contracts/publicationReviewPolicy.contract';
import type { PublicationReviewPolicyService } from './PublicationReviewPolicyService';

export {
  PublicationReviewPolicyService,
  type IPublicationReviewPolicyRepository,
} from './PublicationReviewPolicyService';
export { PolicyBoundVerificationSource } from './PolicyBoundVerificationSource';
export { SqlitePublicationReviewPolicyRepository } from './SqlitePublicationReviewPolicyRepository';

export function registerPublicationReviewPolicies(router: IpcRouter, service: PublicationReviewPolicyService) {
  router.register(publicationReviewPolicyContract, {
    get: async ({ eventId, resultScope }) => service.get(eventId, resultScope),
    save: async (input) => service.save(input),
  });
}
