// SPDX-License-Identifier: MIT
import { writeFile, unlink } from 'node:fs/promises';

import { replaceFileAtomic } from './replaceFileAtomic';

export async function writeFileAtomic(destination: string, content: string | Uint8Array): Promise<void> {
  const temporary = `${destination}.partial-${crypto.randomUUID()}`;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    await replaceFileAtomic(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
