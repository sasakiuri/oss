// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { DirectorMembershipDto } from '@/shared/ipc/contracts';

interface DirectorMembershipStore {
  membership: DirectorMembershipDto | null;
  hydrated: boolean;
  beginHydration: () => void;
  applyChange: (membership: DirectorMembershipDto) => void;
  completeHydration: (membership: DirectorMembershipDto) => void;
}

export const useDirectorMembershipStore = create<DirectorMembershipStore>((set) => ({
  membership: null,
  hydrated: false,
  beginHydration: () => set({ membership: null, hydrated: false }),
  applyChange: (membership) =>
    set((state) => (state.membership && membership.revision <= state.membership.revision ? {} : { membership })),
  completeHydration: (membership) =>
    set((state) => ({
      hydrated: true,
      membership: state.membership && membership.revision <= state.membership.revision ? state.membership : membership,
    })),
}));
