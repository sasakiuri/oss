import { dialog } from 'electron';

import type { IEstBackupRecordFileGateway } from '../application/EstBackupRecordFileGateway';

import { readEstBackupRecordFile } from './readEstBackupRecordFile';

export class ElectronEstBackupRecordFileGateway implements IEstBackupRecordFileGateway {
  constructor(private readonly extensions: readonly string[]) {
    if (extensions.length === 0) throw new Error('At least one EST backup file extension is required');
  }
  async chooseSource(extensions = this.extensions) {
    const path = await chooseEstBackupSourcePath(extensions);
    return path ? readEstBackupRecordFile(path) : null;
  }
}

export async function chooseEstBackupSourcePath(extensions: readonly string[]): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Import EST printout or independent-memory records',
    properties: ['openFile'],
    filters: [{ name: 'EST backup records', extensions: extensions.map((extension) => extension.replace(/^\./, '')) }],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
}
