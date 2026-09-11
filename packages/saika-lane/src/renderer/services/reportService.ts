// SPDX-License-Identifier: MIT
import type { PrinterDto, ScoreSheetDto } from '@/shared/ipc/contracts';

import { createCommandMethod, createServiceMethod, createVoidServiceMethod } from './createServiceMethod';

export const reportService = {
  listPrinters: createVoidServiceMethod<PrinterDto[]>(() => window.electronAPI.report.listPrinters()),
  printReady: createCommandMethod<{ error?: string }>((input) => window.electronAPI.report.printReady(input)),
  getScoreSheet: createServiceMethod<{ sessionId: string }, ScoreSheetDto>((input) =>
    window.electronAPI.report.getScoreSheet(input),
  ),

  openPrintWindow: createCommandMethod<{ sessionId: string }>((input) =>
    window.electronAPI.report.openPrintWindow(input),
  ),
};
