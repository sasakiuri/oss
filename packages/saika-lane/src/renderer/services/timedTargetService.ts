// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const timedTargetService = {
  recordTimingInstallation: createServiceMethod((api) => api.timedTarget.recordTimingInstallation),
  analyzeMeasurements: createServiceMethod((api) => api.timedTarget.analyzeMeasurements),
  getTimingProfiles: createServiceMethod((api) => api.timedTarget.getTimingProfiles),
  saveTimingProfile: createServiceMethod((api) => api.timedTarget.saveTimingProfile),
  applyTimingProfile: createServiceMethod((api) => api.timedTarget.applyTimingProfile),
  getTimingSettings: createServiceMethod((api) => api.timedTarget.getTimingSettings),
  setTimingSettings: createServiceMethod((api) => api.timedTarget.setTimingSettings),
  getState: createServiceMethod((api) => api.timedTarget.getState),
  cancel: createServiceMethod((api) => api.timedTarget.cancel),
};
