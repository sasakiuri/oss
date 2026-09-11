// SPDX-License-Identifier: MIT
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { z } from 'zod';

/** Validation precedes replacement; failed writes leave the last durable revision intact. */
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
      await this.write(value);
      return value;
    }
  }

  write(value: T): Promise<void> {
    const content = JSON.stringify(this.schema.parse(value));
    const operation = this.queue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        const temporary = `${this.path}.${randomUUID()}.tmp`;
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try {
            await handle.writeFile(content, 'utf8');
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporary, this.path);
          // POSIX directory sync makes the rename durable; Windows does not support it.
          if (process.platform !== 'win32') {
            const directory = await open(dirname(this.path), 'r');
            try {
              await directory.sync();
            } finally {
              await directory.close();
            }
          }
        } finally {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      });
    this.queue = operation;
    return operation;
  }
}
