// SPDX-License-Identifier: MIT
import { localProgressControls } from '@/renderer/presentation/policies/localProgressControls';

import { useCompetitionStore } from './competitionStore';
import { useDirectorMembershipStore } from './directorMembershipStore';

/** Whether local progress is allowed now, from the current membership and competition stores. */
export function isProgressAllowed(): boolean {
  return localProgressControls(useDirectorMembershipStore.getState(), 'progress', useCompetitionStore.getState())
    .allowed;
}
