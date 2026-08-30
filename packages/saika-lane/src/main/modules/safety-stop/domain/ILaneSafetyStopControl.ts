import type { LaneSafetyStopState } from './LaneSafetyStopState';

export interface ActivateLaneSafetyStopInput {
  safetyStopId: string;
  reason: string;
  issuedBy: string;
  issuedAt: Date;
}

export interface ClearLaneSafetyStopInput {
  safetyStopId: string;
  clearanceReason: string;
  clearedBy: string;
  clearedAt: Date;
  confirmedSafe: true;
}

export interface ILaneSafetyStopControl {
  activate(input: ActivateLaneSafetyStopInput): Promise<LaneSafetyStopState>;
  clear(input: ClearLaneSafetyStopInput): Promise<LaneSafetyStopState>;
  getState(): LaneSafetyStopState | null;
  isStopped(): boolean;
}

export interface ISafetyTimerFreezer {
  freeze(): Promise<{
    competitionId: string;
    remainingSeconds: number;
    totalSeconds: number;
    frozenAt: Date;
  } | null>;
}
