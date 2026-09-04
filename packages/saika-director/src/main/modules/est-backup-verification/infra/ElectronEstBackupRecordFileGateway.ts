import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { dialog } from 'electron';

import type {
  IEstBackupRecordFileGateway,
  SelectedEstBackupRecordFile,
} from '../application/EstBackupRecordFileGateway';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

export class ElectronEstBackupRecordFileGateway implements IEstBackupRecordFileGateway {
  constructor(private readonly extensions: readonly string[]) {
    if (extensions.length === 0) throw new Error('At least one EST backup file extension is required');
  }

  async chooseSource(): Promise<SelectedEstBackupRecordFile | null> {
    const result = await dialog.showOpenDialog({
      title: 'Import EST printout or independent-memory records',
      properties: ['openFile'],
      filters: [
        {
          name: 'EST backup records',
          extensions: this.extensions.map((extension) => extension.replace(/^\./, '')),
        },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;

    const path = result.filePaths[0];
    const file = await open(path, 'r');
    try {
      const information = await file.stat();
      if (!information.isFile()) throw new Error('The selected EST backup source is not a regular file');
      if (information.size > MAX_SOURCE_BYTES) {
        throw new Error(`The EST backup source exceeds the ${MAX_SOURCE_BYTES}-byte limit`);
      }
      const bytes = await file.readFile();
      if (bytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error(`The EST backup source exceeds the ${MAX_SOURCE_BYTES}-byte limit`);
      }
      let content: string;
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error('The EST backup source must use valid UTF-8 encoding');
      }
      return {
        fileName: basename(path),
        content,
        sizeBytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } finally {
      await file.close();
    }
  }
}
