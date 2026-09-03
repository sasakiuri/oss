export type CommandAuthorizationMode = 'DISABLED' | 'ADVISORY' | 'REQUIRED';

export interface CommandIssuer {
  readonly issuerId?: string;
  readonly issuedBy: string;
}

export interface CommandAuthorizationAssessment {
  readonly allowed: boolean;
  readonly warning?: string;
  readonly reason: string;
}

export interface ICommandAuthorizationPolicy {
  assess(command: CommandIssuer): CommandAuthorizationAssessment;
}

/** Pure trust policy; broker authentication and command execution remain separate adapters. */
export class CommandAuthorizationPolicy implements ICommandAuthorizationPolicy {
  private readonly trustedDirectorIds: ReadonlySet<string>;

  constructor(
    private readonly mode: CommandAuthorizationMode = 'DISABLED',
    trustedDirectorIds: readonly string[] = [],
  ) {
    this.trustedDirectorIds = new Set(trustedDirectorIds.map((value) => value.trim()).filter(Boolean));
    if (mode === 'REQUIRED' && this.trustedDirectorIds.size === 0) {
      throw new Error('Required command authorization needs at least one trusted Director ID');
    }
  }

  assess(command: CommandIssuer): CommandAuthorizationAssessment {
    if (this.mode === 'DISABLED') return { allowed: true, reason: 'Command issuer verification is disabled.' };
    const issuerId = command.issuerId?.trim();
    const trusted = issuerId !== undefined && this.trustedDirectorIds.has(issuerId);
    if (trusted) return { allowed: true, reason: `Trusted Director ${issuerId}.` };

    const reason = issuerId
      ? `Director ${issuerId} is not in the Lane trust list.`
      : `Command from ${command.issuedBy} has no authenticated Director identity.`;
    return this.mode === 'REQUIRED'
      ? { allowed: false, reason }
      : { allowed: true, warning: `command_issuer_unverified: ${reason}`, reason };
  }
}

export function commandAuthorizationPolicyFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): CommandAuthorizationPolicy {
  const configuredMode = environment.SAIKA_COMMAND_AUTHORIZATION_MODE?.trim().toUpperCase();
  if (
    configuredMode &&
    configuredMode !== 'REQUIRED' &&
    configuredMode !== 'ADVISORY' &&
    configuredMode !== 'DISABLED'
  ) {
    throw new Error('SAIKA_COMMAND_AUTHORIZATION_MODE must be DISABLED, ADVISORY, or REQUIRED');
  }
  const mode: CommandAuthorizationMode =
    configuredMode === 'REQUIRED' || configuredMode === 'DISABLED' ? configuredMode : 'ADVISORY';
  const trustedDirectorIds = (environment.SAIKA_TRUSTED_DIRECTOR_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new CommandAuthorizationPolicy(mode, trustedDirectorIds);
}
