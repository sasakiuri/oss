import { create } from 'zustand';

import type { LaneSafetyStateDto } from '@/shared/ipc/contracts';

interface SafetyStopStore {
  state: LaneSafetyStateDto;
  setState: (state: LaneSafetyStateDto) => void;
}

export const CLEAR_SAFETY_STATE: LaneSafetyStateDto = {
  status: 'CLEAR',
  safetyStopId: null,
  reason: null,
  stoppedBy: null,
  stoppedAt: null,
  timerSnapshot: null,
  clearedBy: null,
  clearanceReason: null,
  clearedAt: null,
};

export const useSafetyStopStore = create<SafetyStopStore>((set) => ({
  state: CLEAR_SAFETY_STATE,
  setState: (state) => set({ state }),
}));
