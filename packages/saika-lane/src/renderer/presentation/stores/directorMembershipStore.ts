// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { DirectorMembershipDto } from '@/shared/ipc/contracts';

interface DirectorMembershipStore {
  membership: DirectorMembershipDto | null;
  hydrated: boolean;
  hydrationFailed: boolean;
  beginHydration: () => void;
  failHydration: () => void;
  applyChange: (membership: DirectorMembershipDto) => void;
  completeHydration: (membership: DirectorMembershipDto) => void;
}

export const useDirectorMembershipStore = create<DirectorMembershipStore>((set) => ({
  membership: null,
  hydrated: false,
  hydrationFailed: false,
  beginHydration: () => set({ membership: null, hydrated: false, hydrationFailed: false }),
  failHydration: () => set({ hydrated: false, hydrationFailed: true }),
  applyChange: (membership) =>
    set((state) => (state.membership && membership.revision <= state.membership.revision ? {} : { membership })),
  completeHydration: (membership) =>
    set((state) => ({
      hydrated: true,
      hydrationFailed: false,
      membership: state.membership && membership.revision <= state.membership.revision ? state.membership : membership,
    })),
}));
