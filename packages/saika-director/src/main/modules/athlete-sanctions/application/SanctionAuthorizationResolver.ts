import type { SanctionAuthorization, SanctionAuthorityBasis, SanctionOfficialRole } from '../domain/SanctionDecision';

export interface SanctionAuthorizationRequest {
  readonly authorityBasis: SanctionAuthorityBasis;
  readonly authorityReference: string;
  readonly officialName: string;
  readonly officialRole: SanctionOfficialRole;
}

/** Replaceable trust boundary between transport identity and sanction policy. */
export interface ISanctionAuthorizationResolver {
  resolve(request: SanctionAuthorizationRequest): SanctionAuthorization;
}

/** Explicit fallback for installations that have not enabled authenticated official sessions. */
export class ManualAttestationSanctionAuthorizationResolver implements ISanctionAuthorizationResolver {
  resolve(request: SanctionAuthorizationRequest): SanctionAuthorization {
    return {
      basis: request.authorityBasis,
      authorityReference: request.authorityReference,
      officialName: request.officialName,
      officialRole: request.officialRole,
      officialActorId: null,
      mode: 'MANUAL_ATTESTATION',
    };
  }
}
