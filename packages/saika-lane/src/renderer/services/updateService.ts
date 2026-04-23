// SPDX-License-Identifier: MIT
import type { AppUpdateStateDto } from '@/shared/ipc/contracts';

import { createVoidCommandMethod, createVoidServiceMethod } from './createServiceMethod';

export const updateService = {
  getUpdateState: createVoidServiceMethod<AppUpdateStateDto>(() => window.electronAPI.updates.getUpdateState()),

  checkForUpdates: createVoidServiceMethod<AppUpdateStateDto>(() => window.electronAPI.updates.checkForUpdates()),

  quitAndInstall: createVoidCommandMethod(() => window.electronAPI.updates.quitAndInstall()),
};
