import type { EstComplaintTimingAdvisoryDto } from '@/shared/ipc/contracts';

import type { EstComplaintSignalSnapshot } from './IEstComplaintSignalSource';

const THREE_MINUTES_MS = 3 * 60 * 1000;

/** Produces review guidance only; the Jury remains responsible for the ruling. */
export class EstComplaintTimingPolicy {
  assess(snapshot: EstComplaintSignalSnapshot): EstComplaintTimingAdvisoryDto {
    const elapsedMilliseconds = elapsedSinceLastShot(snapshot);

    if (snapshot.issue === 'TARGET_FAILURE') {
      return advisory(
        'TARGET_FAILURE_EXCEPTION',
        elapsedMilliseconds,
        'The shot-value timing limit has a target-failure exception. Confirm the failure and follow the target examination procedure.',
      );
    }
    if (snapshot.issue === 'TARGET_MEDIA_ADVANCE') {
      return advisory(
        'SEPARATE_TARGET_PROCEDURE',
        elapsedMilliseconds,
        'Apply the paper or rubber strip failure procedure and preserve the listed examination evidence.',
      );
    }
    if (
      snapshot.issue === 'SHOT_VALUE' &&
      snapshot.context.lastShot &&
      snapshot.context.recordedShots === snapshot.context.lastShot.shotNumberInSeries
    ) {
      return advisory(
        'CAPTURED_BEFORE_NEXT_RECORDED_SHOT',
        elapsedMilliseconds,
        'The Lane snapshot was captured before another shot was recorded. Confirm the firing sequence and clock evidence before ruling.',
      );
    }
    if (snapshot.issue === 'SHOT_VALUE' && elapsedMilliseconds !== null && elapsedMilliseconds <= THREE_MINUTES_MS) {
      return advisory(
        'WITHIN_THREE_MINUTES_OF_LAST_RECORDED_SHOT',
        elapsedMilliseconds,
        'The Lane timestamps place the complaint within three minutes of the latest recorded shot. Confirm clock quality before ruling.',
      );
    }
    return advisory(
      'REQUIRES_OFFICIAL_REVIEW',
      elapsedMilliseconds,
      'The captured data does not establish a timing outcome. Review the firing sequence, target failure status, and clock evidence.',
    );
  }
}

function elapsedSinceLastShot(snapshot: EstComplaintSignalSnapshot): number | null {
  if (!snapshot.context.lastShot) return null;
  const elapsed = snapshot.signalledAt.getTime() - Date.parse(snapshot.context.lastShot.receivedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function advisory(
  status: EstComplaintTimingAdvisoryDto['status'],
  elapsedMilliseconds: number | null,
  guidance: string,
): EstComplaintTimingAdvisoryDto {
  return {
    advisoryOnly: true,
    status,
    elapsedMilliseconds,
    ruleReference: 'ISSF 6.16.5.2',
    guidance,
  };
}
