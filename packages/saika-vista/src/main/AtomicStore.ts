// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { z } from 'zod';

/** The file was replaced, but the following storage confirmation failed. */
export class AtomicStoreSyncError extends Error {
  constructor(cause: unknown) {
    super(
      `Vista data was replaced, but durable storage was not confirmed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

export type StoreWriteResult = { durable: true } | { durable: false; error: AtomicStoreSyncError };

/** Failures before rename preserve the previous file; later failures report that replacement occurred. */
export class AtomicStore<T> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly schema: z.ZodType<T>,
  ) {}

  async read(create: () => T): Promise<T> {
    try {
      return this.schema.parse(JSON.parse(await readFile(this.path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Saved Vista data is invalid or unsupported. The file was not changed.', { cause: error });
      const value = this.schema.parse(create());
      const result = await this.write(value);
      if (!result.durable) throw result.error;
      return value;
    }
  }

  write(value: T): Promise<StoreWriteResult> {
    const content = JSON.stringify(this.schema.parse(value));
    const operation = this.queue
      .catch(() => undefined)
      .then(async (): Promise<StoreWriteResult> => {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        let replaced = false;
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try {
            await handle.writeFile(content, 'utf8');
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporary, this.path);
          replaced = true;
          // POSIX directory sync makes the rename durable; Windows does not support it.
          if (process.platform !== 'win32') {
            const directory = await open(dirname(this.path), 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
          return { durable: true };
        } catch (error) {
          if (replaced) return { durable: false, error: new AtomicStoreSyncError(error) };
          throw error;
        } finally {
          if (!replaced)
            await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
              if (error.code !== 'ENOENT') throw error;
            });
        }
      });
    this.queue = operation;
    return operation;
  }
}
