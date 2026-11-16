// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const updateService = {
  getUpdateState: createServiceMethod((api) => api.updates.getUpdateState),
  checkForUpdates: createServiceMethod((api) => api.updates.checkForUpdates),
  quitAndInstall: createServiceMethod((api) => api.updates.quitAndInstall),
};
