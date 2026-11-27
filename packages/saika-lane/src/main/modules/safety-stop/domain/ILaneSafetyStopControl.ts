// SPDX-License-Identifier: MIT
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

/** Throws a plain error naming the blocked action while the Lane safety stop is active. */
export function assertSafetyStopCleared(
  control: Pick<ILaneSafetyStopControl, 'isStopped' | 'getState'>,
  action: string,
): void {
  if (!control.isStopped()) return;
  const safetyStopId = control.getState()?.safetyStopId ?? 'unknown';
  throw new Error(`Safety stop ${safetyStopId} is active; ${action} is blocked`);
}
