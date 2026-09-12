// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@sasakiuri/saika-updater';
import { vi } from 'vitest';

import type { UpdateBridge } from '../src/shared/updateBridge';

export const updateState: AppUpdateStateDto = {
  status: 'unsupported',
  currentVersion: '0.3.0',
  targetVersion: null,
  releaseName: null,
  releaseDate: null,
  releaseNotes: null,
  downloadPercent: null,
  transferredBytes: null,
  totalBytes: null,
  bytesPerSecond: null,
  lastCheckedAt: null,
  errorMessage: 'Updates are available in installed releases.',
  canCheckForUpdates: false,
  canInstallUpdate: false,
};

export function updateBridge(state = updateState): UpdateBridge {
  return {
    getState: vi.fn(async () => state),
    check: vi.fn(async () => state),
    install: vi.fn(async () => {}),
    onChange: vi.fn(() => () => {}),
  };
}
