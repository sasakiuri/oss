export interface SigningActor {
  readonly id: string;
  readonly name: string;
  readonly roles?: readonly string[];
}

/** An identity provider can be replaced independently of any result workflow. */
export interface SigningIdentitySource {
  currentActor(): SigningActor | null;
  authenticationRequired(): boolean;
  findActiveAccount(id: string): SigningActor | null;
}

export interface OfficialSigningRequest {
  readonly officialName: string;
  readonly officialActorId?: string | null;
  /** Set by the consuming workflow, never by an IPC request. */
  readonly requiredRole?: string;
  readonly method?: 'SELF' | 'EXTERNAL';
  readonly recordedBy?: string;
  readonly evidenceReference?: string;
}

export interface OfficialSigningEvidence {
  readonly method: 'AUTHENTICATED' | 'MANUAL' | 'EXTERNAL';
  readonly actorId: string | null;
  readonly recordedBy: string;
  readonly evidenceReference: string | null;
}

export interface IOfficialSigningPolicy {
  resolveAccount(id: string): SigningActor;
  authorize(request: OfficialSigningRequest): OfficialSigningEvidence;
}

/** Records external signatures explicitly; it never presents them as personal sign-in. */
export class OfficialSigningPolicy implements IOfficialSigningPolicy {
  constructor(
    private readonly identities: SigningIdentitySource = {
      currentActor: () => null,
      authenticationRequired: () => false,
      findActiveAccount: () => null,
    },
    private readonly allowExternalSignatures: () => boolean = () => true,
  ) {}

  resolveAccount(id: string): SigningActor {
    const actor = this.identities.findActiveAccount(id);
    if (!actor) throw new Error('Select an active operator account for this official');
    return actor;
  }

  authorize(request: OfficialSigningRequest): OfficialSigningEvidence {
    const actor = this.identities.currentActor();
    if (!actor && this.identities.authenticationRequired())
      throw new Error('Sign in before recording an official signature');
    if (request.method === 'EXTERNAL') {
      if (!this.allowExternalSignatures()) throw new Error('External signature recording is disabled');
      return {
        method: 'EXTERNAL',
        actorId: actor?.id ?? null,
        recordedBy: actor?.name ?? required(request.recordedBy, 'Recorder name'),
        evidenceReference: required(request.evidenceReference, 'External signature evidence'),
      };
    }
    if (request.method !== undefined && request.method !== 'SELF') throw new Error('Unknown signature method');
    if (actor) {
      if (request.requiredRole && !actor.roles?.includes(request.requiredRole))
        throw new Error('The signed-in operator does not have the required official role');
      if (!request.officialActorId && !request.requiredRole)
        throw new Error('Link this official appointment to an operator account, or record an external signature');
      if (request.officialActorId && request.officialActorId !== actor.id)
        throw new Error('The signed-in operator is not the appointed signer');
      return { method: 'AUTHENTICATED', actorId: actor.id, recordedBy: actor.name, evidenceReference: null };
    }
    return {
      method: 'MANUAL',
      actorId: null,
      recordedBy: required(request.officialName, 'Official name'),
      evidenceReference: null,
    };
  }
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`${label} is required`);
  return value.trim();
}
