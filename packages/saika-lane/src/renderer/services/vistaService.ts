// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const vistaService = {
  getStatus: createServiceMethod((api) => api.vista.getStatus),
  setEnabled: createServiceMethod((api) => api.vista.setEnabled),
  resetPairing: createServiceMethod((api) => api.vista.resetPairing),
};
