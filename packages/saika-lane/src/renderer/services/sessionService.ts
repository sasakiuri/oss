// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const sessionService = {
  switchMode: createServiceMethod((api) => api.commands.switchMode),
  getSessionScore: createServiceMethod((api) => api.queries.getSessionScore),
  getShotHistory: createServiceMethod((api) => api.queries.getShotHistory),
};
