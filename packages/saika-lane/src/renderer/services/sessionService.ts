// SPDX-License-Identifier: MIT
import type { Discipline, SessionMode, SessionScoreDto, ShotHistoryDto } from '@/shared/ipc/contracts';

import { createCommandMethod, createServiceMethod } from './createServiceMethod';

export const sessionService = {
  startSession: createServiceMethod<{ discipline: Discipline }, { sessionId: string }>((input) =>
    window.electronAPI.commands.startSession(input),
  ),

  switchMode: createCommandMethod<{ sessionId: string; mode: SessionMode }>((input) =>
    window.electronAPI.commands.switchMode(input),
  ),

  resetSession: createCommandMethod<{ sessionId: string }>((input) => window.electronAPI.commands.resetSession(input)),

  getSessionScore: createServiceMethod<{ sessionId: string }, SessionScoreDto>((input) =>
    window.electronAPI.queries.getSessionScore(input),
  ),

  getShotHistory: createServiceMethod<{ sessionId: string }, ShotHistoryDto>((input) =>
    window.electronAPI.queries.getShotHistory(input),
  ),
};
