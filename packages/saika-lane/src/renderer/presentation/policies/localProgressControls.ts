// SPDX-License-Identifier: MIT
import type { CompetitionStateDto, DirectorMembershipDto } from '@/shared/ipc/contracts';

interface MembershipState {
  membership: DirectorMembershipDto | null;
  hydrated: boolean;
  hydrationFailed: boolean;
}

/** The loaded Director membership, or why it is unavailable. */
function loadedMembership({ membership, hydrated, hydrationFailed }: MembershipState): DirectorMembershipDto | string {
  if (hydrationFailed) return 'Director membership could not be loaded';
  if (!hydrated || !membership) return 'Director membership is not yet available';
  return membership;
}

/** Renderer permission shared by local progress actions and competition-type choices. */
export function localProgressControls(
  membershipState: MembershipState,
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
    const membership = loadedMembership(membershipState);
    if (typeof membership === 'string') return { allowed: false, reason: membership };
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
  const membership = loadedMembership(membershipState);
  if (typeof membership === 'string') return { allowed: false, reason: membership };
  if (membership.competitionId !== null) {
    return { allowed: false, reason: 'Competition progress is controlled by Director' };
  }
  return { allowed: true, reason: undefined };
}
