import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readEstBackupRecordFile } from '@/main/modules/est-backup-verification/infra/readEstBackupRecordFile';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'saika-backup-read-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('bounded backup file reads', () => {
  it('retains exact UTF-8 bytes and identity, including a byte order mark', async () => {
    const content = '\uFEFF[{"key":"Åsa","totalScore":600}]';
    const path = join(directory, 'backup.json');
    await writeFile(path, content);
    expect(await readEstBackupRecordFile(path)).toEqual({
      fileName: 'backup.json',
      content,
      sizeBytes: Buffer.byteLength(content),
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  });
  it('rejects invalid encoding, non-files and excessive source sizes', async () => {
    const path = join(directory, 'backup.json');
    await writeFile(path, Buffer.from([0xff]));
    await expect(readEstBackupRecordFile(path)).rejects.toThrow('UTF-8');
    await expect(readEstBackupRecordFile(directory)).rejects.toThrow('regular file');
    await writeFile(path, Buffer.alloc(2 * 1024 * 1024 + 1));
    await expect(readEstBackupRecordFile(path)).rejects.toThrow('limit');
  });
});
