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

/** Consumer-owned port for an independently implemented team-result comparison workflow. */
export interface ITeamResultVerificationReadiness {
  assess(request: TeamResultVerificationReadinessRequest): Promise<TeamResultVerificationReadiness>;
}

/** Safe fallback for local deployments that do not install a team verification adapter. */
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
