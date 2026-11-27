// SPDX-License-Identifier: MIT
import type { LaneSafetyStateDto } from '@/shared/ipc/contracts';

import type { LaneSafetyStopState } from '../domain/LaneSafetyStopState';

/** The Lane safety latch as served over IPC and published over MQTT; no state reads as CLEAR. */
export function toLaneSafetyStateDto(state: LaneSafetyStopState | null): LaneSafetyStateDto {
  return {
    status: state?.status ?? 'CLEAR',
    safetyStopId: state?.safetyStopId ?? null,
    reason: state?.reason ?? null,
    stoppedBy: state?.stoppedBy ?? null,
    stoppedAt: state?.stoppedAt.toISOString() ?? null,
    timerSnapshot: state?.timerSnapshot
      ? {
          competitionId: state.timerSnapshot.competitionId,
          remainingSeconds: state.timerSnapshot.remainingSeconds,
          totalSeconds: state.timerSnapshot.totalSeconds,
          frozenAt: state.timerSnapshot.frozenAt.toISOString(),
        }
      : null,
    clearedBy: state?.clearedBy ?? null,
    clearanceReason: state?.clearanceReason ?? null,
    clearedAt: state?.clearedAt?.toISOString() ?? null,
  };
}
