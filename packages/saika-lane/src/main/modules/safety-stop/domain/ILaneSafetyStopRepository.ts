import type { LaneSafetyStopState, LaneSafetyTimerSnapshot } from './LaneSafetyStopState';

export interface ILaneSafetyStopRepository {
  getCurrent(): LaneSafetyStopState | null;
  appendStopped(state: LaneSafetyStopState): void;
  appendTimerFrozen(safetyStopId: string, snapshot: LaneSafetyTimerSnapshot): void;
  appendCleared(state: LaneSafetyStopState): void;
}
