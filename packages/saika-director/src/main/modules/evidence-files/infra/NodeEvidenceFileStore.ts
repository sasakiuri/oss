import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { IEvidenceFileStore } from '../domain/EvidenceFile';

export const DEFAULT_EVIDENCE_FILE_LIMIT = 32 * 1024 * 1024;

/** Content-addressed original bytes, installed without overwriting existing content. */
export class NodeEvidenceFileStore implements IEvidenceFileStore {
  constructor(
    private readonly directory: string,
    private readonly maximumBytes = DEFAULT_EVIDENCE_FILE_LIMIT,
  ) {}

  async put(bytes: Uint8Array) {
    if (bytes.byteLength > this.maximumBytes) throw new Error(`Evidence file exceeds ${this.maximumBytes} bytes`);
    const sha256 = digest(bytes);
    const sizeBytes = bytes.byteLength;
    await mkdir(this.directory, { recursive: true });
    const destination = this.path(sha256);
    const temporary = join(this.directory, `.import-${randomUUID()}`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, destination);
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
      }
      await this.readVerified(sha256, sizeBytes);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return { sha256, sizeBytes };
  }

  async readVerified(sha256: string, sizeBytes: number): Promise<Uint8Array> {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > this.maximumBytes)
      throw new Error('Invalid evidence file size');
    const handle = await open(this.path(sha256), 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== sizeBytes)
        throw new Error('Evidence file size does not match the custody record');
      const bytes = await handle.readFile();
      if (bytes.byteLength !== sizeBytes || digest(bytes) !== sha256) throw new Error('Evidence file SHA-256 mismatch');
      return bytes;
    } finally {
      await handle.close();
    }
  }

  private path(sha256: string): string {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid evidence content key');
    return join(this.directory, `${sha256}.bin`);
  }
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
