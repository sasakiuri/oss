// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const sessionService = {
  startSession: createServiceMethod((api) => api.commands.startSession),
  switchMode: createServiceMethod((api) => api.commands.switchMode),
  resetSession: createServiceMethod((api) => api.commands.resetSession),
  getSessionScore: createServiceMethod((api) => api.queries.getSessionScore),
  getShotHistory: createServiceMethod((api) => api.queries.getShotHistory),
};
