import type { RecoveryFiringPlan } from '@sasakiuri/saika-rules';

export const MALFUNCTION_FIRING_OWNER = 'qualification-malfunction';
export const FINAL_RECOVERY_FIRING_OWNER = 'final-recovery';
export const recoveryFiringOwner = (request: MalfunctionFiringRequest): string =>
  request.workflow === 'FINAL_RECOVERY' ? FINAL_RECOVERY_FIRING_OWNER : MALFUNCTION_FIRING_OWNER;

export interface MalfunctionFiringRequest {
  readonly workflow?: 'FINAL_RECOVERY';
  readonly finalIncident?: 'MALFUNCTION' | 'EST_FAILURE';
  readonly runId: string;
  readonly competitionId: string;
  readonly caseId: string;
  readonly authorizationId: string;
  readonly participantId: string;
  readonly sessionId: string;
  readonly rulePackFingerprint: string;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly recordedShots: number;
  readonly remedy: RecoveryFiringPlan['remedy'];
  readonly shotsToFire: number;
  readonly officialName: string;
  readonly decidedAt: string;
  readonly loadAt: string;
}

export interface MalfunctionFiringShot {
  readonly shotId: string;
  readonly observationId: string | null;
  readonly scoreX10: number;
  readonly deviceScoreX10: number | null;
  readonly calculatedScoreX10: number;
  readonly innerTen: boolean;
  readonly x: number | null;
  readonly y: number | null;
  readonly firedAt: string;
  readonly receivedAt: string;
  readonly eligible: boolean;
  readonly reviewReason: string | null;
}

export interface MalfunctionFiringStart {
  readonly request: MalfunctionFiringRequest;
  readonly plan: RecoveryFiringPlan;
  readonly targetProfileId: string;
  readonly startedAt: string;
}

export interface MalfunctionFiringRun extends Omit<MalfunctionFiringStart, 'plan' | 'targetProfileId' | 'startedAt'> {
  readonly plan: RecoveryFiringPlan | null;
  readonly targetProfileId: string | null;
  readonly startedAt: string | null;
  readonly captureIssues: readonly string[];
  readonly status: 'RUNNING' | 'COMPLETED' | 'CANCELLED';
  readonly terminalReason: string | null;
  readonly shots: readonly MalfunctionFiringShot[];
}

export interface IMalfunctionFiringRepository {
  find(runId: string): MalfunctionFiringRun | null;
  active(): MalfunctionFiringRun | null;
  appendStart(start: MalfunctionFiringStart): void;
  appendCancelledRequest(request: MalfunctionFiringRequest, reason: string): void;
  appendShot(runId: string, shot: MalfunctionFiringShot): void;
  finish(runId: string, status: 'COMPLETED' | 'CANCELLED', reason: string): void;
}

/** Replaceable live identity/rule source; the executor does not own competition or assignments. */
export interface IMalfunctionFiringContextSource {
  prepare(request: MalfunctionFiringRequest): Promise<{
    readonly plan: RecoveryFiringPlan;
    readonly targetProfileId: string;
  }>;
}

export interface IMalfunctionFiringControl {
  start(request: MalfunctionFiringRequest): Promise<MalfunctionFiringRun>;
  read(competitionId: string, runId: string): MalfunctionFiringRun;
  cancel(
    competitionId: string,
    runId: string,
    reason: string,
    request?: MalfunctionFiringRequest,
  ): MalfunctionFiringRun;
}
