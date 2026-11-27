// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';

import type { ShotDto } from './dto';

/** The renderer view of a recorded shot, with the device-reported mode when its observation is known. */
export function toShotDto(shot: Shot, reportedMode?: ShotDto['reportedMode']): ShotDto {
  return {
    id: shot.id,
    shotNumber: shot.shotNumber,
    seriesNumber: shot.seriesNumber,
    x: shot.impactPoint !== null ? shot.impactPoint.x : null,
    y: shot.impactPoint !== null ? shot.impactPoint.y : null,
    score: shot.score.value,
    innerTen: shot.innerTen,
    timestamp: shot.timestamp.toISOString(),
    mode: shot.mode.value,
    // Only match shots are recorded.
    isRecorded: shot.mode.isMatch(),
    receivedAt: shot.receivedAt.toISOString(),
    ...(reportedMode !== undefined ? { reportedMode } : {}),
    competitionContext: shot.competitionContext ?? null,
  };
}
