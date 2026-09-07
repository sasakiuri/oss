// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import { BrowserWindow, dialog } from 'electron';

import { writeFileAtomic } from '@/main/shared-infra/files/writeFileAtomic';

import type {
  IResultsBookDocumentExporter,
  ResultsBookDocumentFormat,
  ResultsBookExportResult,
} from '../application/IResultsBookDocumentExporter';
import { renderResultsBookHtml } from '../domain/renderResultsBookHtml';

export class ElectronResultsBookDocumentExporter implements IResultsBookDocumentExporter {
  async export(
    document: Readonly<Record<string, unknown>>,
    format: ResultsBookDocumentFormat,
    suggestedName: string,
  ): Promise<ResultsBookExportResult> {
    const destination = await dialog.showSaveDialog({
      title: `Export Results Book ${format}`,
      defaultPath: suggestedName,
      filters: [{ name: `Results Book ${format}`, extensions: [format.toLowerCase()] }],
    });
    if (destination.canceled || !destination.filePath) return { status: 'CANCELLED' };
    const html = renderResultsBookHtml(document);
    const content = format === 'HTML' ? Buffer.from(html, 'utf8') : await renderPdf(html);
    await writeFileAtomic(destination.filePath, content);
    return {
      status: 'COMPLETED',
      path: destination.filePath,
      fileName: basename(destination.filePath),
      sizeBytes: content.byteLength,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  }
}

async function renderPdf(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await window.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:9px;text-align:center;width:100%"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    window.destroy();
  }
}
