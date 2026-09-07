import { dialog } from 'electron';
import { open, rename, unlink, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { IEvidenceFileTransfer } from '../domain/EvidenceFile';
import { DEFAULT_EVIDENCE_FILE_LIMIT } from './NodeEvidenceFileStore';

export class ElectronEvidenceFileTransfer implements IEvidenceFileTransfer {
  constructor(private readonly maximumBytes = DEFAULT_EVIDENCE_FILE_LIMIT) {}

  async chooseSource() {
    const selected = await dialog.showOpenDialog({ title: 'Import original evidence file', properties: ['openFile'] });
    const path = selected.filePaths[0];
    if (selected.canceled || !path) return null;
    const handle = await open(path, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > this.maximumBytes)
        throw new Error(`Choose a regular file of at most ${this.maximumBytes} bytes`);
      const bytes = await handle.readFile();
      if (bytes.byteLength > this.maximumBytes) throw new Error('Evidence file grew beyond the import limit');
      return { fileName: basename(path), bytes };
    } finally {
      await handle.close();
    }
  }

  async saveCopy(fileName: string, bytes: Uint8Array): Promise<boolean> {
    const selected = await dialog.showSaveDialog({
      title: 'Save verified evidence copy',
      defaultPath: basename(fileName),
    });
    if (selected.canceled || !selected.filePath) return false;
    const temporary = `${selected.filePath}.partial-${crypto.randomUUID()}`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, selected.filePath);
      return true;
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
