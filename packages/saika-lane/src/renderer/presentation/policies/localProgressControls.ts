// SPDX-License-Identifier: MIT
import type { CompetitionStateDto, DirectorMembershipDto } from '@/shared/ipc/contracts';

/** Renderer permission shared by local progress actions and competition-type choices. */
export function localProgressControls(
  {
    membership,
    hydrated,
    hydrationFailed,
  }: {
    membership: DirectorMembershipDto | null;
    hydrated: boolean;
    hydrationFailed: boolean;
  },
  action: 'progress' | 'sighting' | 'match' = 'progress',
  competition?: {
    phase: string;
    interruption?: { status: string } | null;
    athleteTargetControl: CompetitionStateDto['athleteTargetControl'];
    athleteTargetControlPending?: boolean;
    athleteTargetControlLoaded?: boolean;
  },
): { allowed: boolean; reason: string | undefined } {
  if (
    action === 'progress' &&
    (competition?.interruption?.status === 'PAUSED' || competition?.interruption?.status === 'RESUME_PENDING')
  ) {
    if (hydrationFailed) return { allowed: false, reason: 'Director membership could not be loaded' };
    if (!hydrated || !membership) return { allowed: false, reason: 'Director membership is not yet available' };
    return {
      allowed: false,
      reason: membership.competitionId
        ? 'Await Director instruction'
        : 'Finish the stopped saved run before starting again',
    };
  }
  if (competition?.phase === 'ACTIVE' && !competition.athleteTargetControlLoaded && action !== 'progress') {
    return {
      allowed: false,
      reason: competition.athleteTargetControlPending
        ? 'Target controls are loading'
        : 'Target controls are unavailable. Press either mode button to retry.',
    };
  }
  const control = competition?.phase === 'ACTIVE' ? competition.athleteTargetControl : null;
  if (control && action !== 'progress') {
    const allowed = action === 'sighting' ? control.sightingAllowed : control.matchAllowed;
    return {
      allowed,
      reason: allowed
        ? undefined
        : control.officialSighting
          ? 'Official sighting is in progress'
          : action === 'sighting'
            ? 'Sighting is unavailable after the first Match shot of this series'
            : control.matchUnavailableReason === 'SIGHTING_REQUIRED'
              ? 'Switch to Sighting before selecting Match.'
              : 'This position change allows Sighting only',
    };
  }
  if (hydrationFailed) return { allowed: false, reason: 'Director membership could not be loaded' };
  if (!hydrated || !membership) return { allowed: false, reason: 'Director membership is not yet available' };
  if (membership.competitionId !== null) {
    return { allowed: false, reason: 'Competition progress is controlled by Director' };
  }
  return { allowed: true, reason: undefined };
}
