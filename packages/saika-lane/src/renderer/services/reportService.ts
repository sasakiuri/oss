// SPDX-License-Identifier: MIT
import type { ScoreSheetDto } from '@/shared/ipc/contracts';

import { createCommandMethod, createServiceMethod } from './createServiceMethod';

export const reportService = {
  getScoreSheet: createServiceMethod<{ sessionId: string }, ScoreSheetDto>((input) =>
    window.electronAPI.report.getScoreSheet(input),
  ),

  openPrintWindow: createCommandMethod<{ sessionId: string }>((input) =>
    window.electronAPI.report.openPrintWindow(input),
  ),
};
