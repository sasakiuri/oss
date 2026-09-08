import type {
  ISanctionAuthorizationResolver,
  SanctionAuthorization,
  SanctionAuthorizationRequest,
} from '@/main/modules/athlete-sanctions';
import type { OperatorAccount } from '@/shared/ipc/contracts/operatorAccess.contract';

/** Application access does not itself confer Jury, equipment Jury or anti-doping authority. */
export class SessionSanctionAuthorizationResolver implements ISanctionAuthorizationResolver {
  constructor(
    private readonly actor: () => OperatorAccount | null,
    private readonly required: () => boolean,
    private readonly fallback: ISanctionAuthorizationResolver,
  ) {}
  resolve(request: SanctionAuthorizationRequest): SanctionAuthorization {
    const actor = this.actor();
    if (!actor) {
      if (this.required()) throw new Error('An authenticated official session is required');
      return this.fallback.resolve(request);
    }
    if (!actor.officialRoles.includes(request.officialRole))
      throw new Error('This operator has not been assigned the required official role');
    return {
      basis: request.authorityBasis,
      authorityReference: request.authorityReference,
      officialName: actor.name,
      officialRole: request.officialRole,
      officialActorId: actor.id,
      mode: 'AUTHENTICATED_SESSION',
    };
  }
}
