import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';

import type { SelectedEstBackupRecordFile } from '../application/EstBackupRecordFileGateway';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

/** A bounded read shared by one-shot imports and independently scheduled capture feeds. */
export async function readEstBackupRecordFile(path: string): Promise<SelectedEstBackupRecordFile> {
  const file = await open(path, 'r');
  try {
    const before = await file.stat();
    if (!before.isFile()) throw new Error('The selected EST backup source is not a regular file');
    if (before.size > MAX_SOURCE_BYTES) throw new Error('The EST backup source exceeds the 2 MiB limit');
    const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_SOURCE_BYTES) throw new Error('The EST backup source exceeds the 2 MiB limit');
    const after = await file.stat();
    if (
      length !== before.size ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw new Error('The backup source changed during reading; wait for a complete snapshot');
    const bytes = buffer.subarray(0, length);
    let content: string;
    try {
      content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error('The EST backup source must use valid UTF-8 encoding');
    }
    return {
      fileName: basename(path),
      content,
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  } finally {
    await file.close();
  }
}
