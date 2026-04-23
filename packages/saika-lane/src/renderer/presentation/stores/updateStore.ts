// SPDX-License-Identifier: MIT
import { create } from 'zustand';

import type { AppUpdateStateDto } from '@/shared/ipc/contracts';

type UpdateState = AppUpdateStateDto;

interface UpdateActions {
  setState: (state: AppUpdateStateDto) => void;
  reset: () => void;
}

const initialState: UpdateState = {
  status: 'idle',
  currentVersion: typeof window !== 'undefined' ? (window.electronAPI?.appVersion ?? '') : '',
  targetVersion: null,
  releaseName: null,
  releaseDate: null,
  releaseNotes: null,
  downloadPercent: null,
  transferredBytes: null,
  totalBytes: null,
  bytesPerSecond: null,
  lastCheckedAt: null,
  errorMessage: null,
  canCheckForUpdates: true,
  canInstallUpdate: false,
};

export const useUpdateStore = create<UpdateState & UpdateActions>((set) => ({
  ...initialState,

  setState: (state) => {
    set(state);
  },

  reset: () => {
    set(initialState);
  },
}));
