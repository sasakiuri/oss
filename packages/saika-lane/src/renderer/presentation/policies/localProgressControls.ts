// SPDX-License-Identifier: MIT
import type { DirectorMembershipDto } from '@/shared/ipc/contracts';

/** Renderer permission shared by local progress actions and competition-type choices. */
export function localProgressControls({
  membership,
  hydrated,
}: {
  membership: DirectorMembershipDto | null;
  hydrated: boolean;
}): { allowed: boolean; reason: string | undefined } {
  if (!hydrated || !membership) return { allowed: false, reason: 'Director membership is not yet available' };
  if (membership.competitionId !== null) {
    return { allowed: false, reason: 'Competition progress is controlled by Director' };
  }
  return { allowed: true, reason: undefined };
}
