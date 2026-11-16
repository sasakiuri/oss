import { dialog } from 'electron';
import { writeFile, unlink } from 'node:fs/promises';

import { replaceFileAtomic } from '@/main/shared-infra/files/replaceFileAtomic';

import type { ArchiveFileGateway } from '../application/OperationalArchivePorts';

export class ElectronArchiveFileGateway implements ArchiveFileGateway {
  async chooseEvidenceDestination(suggestedFileName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Export competition evidence bundle',
      defaultPath: suggestedFileName,
      filters: [{ name: 'Saika evidence bundle', extensions: ['json'] }],
    });
    return result.canceled ? null : (result.filePath ?? null);
  }

  async chooseBackupDestination(suggestedFileName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Create Director database backup',
      defaultPath: suggestedFileName,
      filters: [{ name: 'Saika Director database', extensions: ['db'] }],
    });
    return result.canceled ? null : (result.filePath ?? null);
  }

  async chooseResultsBookDestination(suggestedFileName: string): Promise<string | null> {
    const result = await dialog.showSaveDialog({
      title: 'Export Official Results Book',
      defaultPath: suggestedFileName,
      filters: [{ name: 'Saika Official Results Book', extensions: ['json'] }],
    });
    return result.canceled ? null : (result.filePath ?? null);
  }

  async chooseRestoreSource(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: 'Inspect a Director database backup',
      properties: ['openFile'],
      filters: [{ name: 'Saika Director database', extensions: ['db'] }],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }

  async writeUtf8Atomic(destination: string, content: string): Promise<void> {
    const temporary = `${destination}.partial-${crypto.randomUUID()}`;
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
      await replaceFileAtomic(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
