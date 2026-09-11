export type TeamResultVerificationKind = 'TEAM' | 'MIXED_TEAM';

export interface TeamResultVerificationReadinessRequest {
  eventId: string;
  resultKind: TeamResultVerificationKind;
  configuredChecks: number;
  requireResults: boolean;
}

export interface TeamResultVerificationReadiness {
  supported: boolean;
  configuredChecks: number;
  requiredChecks: number;
  checkedResults: number;
  snapshotRevision: string | null;
  currentVerificationId: string | null;
  issues: string[];
}

/** Reports team comparison coverage and outstanding verification issues. */
export interface ITeamResultVerificationReadiness {
  assess(request: TeamResultVerificationReadinessRequest): Promise<TeamResultVerificationReadiness>;
}

/** Allows unchecked teams only when no team verification checks are configured. */
export class UnsupportedTeamResultVerificationReadiness implements ITeamResultVerificationReadiness {
  async assess(request: TeamResultVerificationReadinessRequest): Promise<TeamResultVerificationReadiness> {
    const supported = request.configuredChecks === 0;
    return {
      supported,
      configuredChecks: request.configuredChecks,
      requiredChecks: request.configuredChecks,
      checkedResults: 0,
      snapshotRevision: null,
      currentVerificationId: null,
      issues: supported ? [] : [`Verification of the top ${request.configuredChecks} team results is not implemented`],
    };
  }
}
