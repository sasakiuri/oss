import { createHash } from 'node:crypto';
import { dialog } from 'electron';

import { writeFileAtomic } from '@/main/shared-infra/files/writeFileAtomic';
import type { IMalfunctionScoreSheetExporter } from '../application/MalfunctionScoreSheetPorts';
import type { MalfunctionScoreSheet } from '../domain/MalfunctionScoreSheet';
import { renderMalfunctionScoreSheetHtml } from '../domain/renderMalfunctionScoreSheetHtml';

export class ElectronMalfunctionScoreSheetExporter implements IMalfunctionScoreSheetExporter {
  async export(sheet: MalfunctionScoreSheet) {
    const destination = await dialog.showSaveDialog({
      title: 'Export malfunction calculation',
      defaultPath: `${sheet.calculation.form}-${sheet.id}-v${sheet.version}.html`,
      filters: [{ name: 'Printable malfunction calculation', extensions: ['html'] }],
    });
    if (destination.canceled || !destination.filePath) return { status: 'CANCELLED' as const };
    const content = renderMalfunctionScoreSheetHtml(sheet);
    await writeFileAtomic(destination.filePath, content);
    return {
      status: 'COMPLETED' as const,
      path: destination.filePath,
      sha256: createHash('sha256').update(content).digest('hex'),
      sizeBytes: Buffer.byteLength(content),
    };
  }
}
