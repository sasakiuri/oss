// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const reportService = {
  listPrinters: createServiceMethod((api) => api.report.listPrinters),
  printReady: createServiceMethod((api) => api.report.printReady),
  getScoreSheet: createServiceMethod((api) => api.report.getScoreSheet),
  openPrintWindow: createServiceMethod((api) => api.report.openPrintWindow),
};
