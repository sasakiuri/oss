// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const startupService = {
  getStartupState: createServiceMethod((api) => api.startup.getStartupState),
  setAsideSavedRun: createServiceMethod((api) => api.startup.setAsideSavedRun),
  retryStartup: createServiceMethod((api) => api.startup.retryStartup),
};
