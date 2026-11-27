// SPDX-License-Identifier: MIT
import { writeFile, unlink } from 'node:fs/promises';

import { replaceFileAtomic } from './replaceFileAtomic';

/**
 * Writes a temporary file next to the destination and moves it over the destination. The file is created
 * with `mode` (owner-only by default; 0o666 follows the process umask like a plain write).
 */
export async function writeFileAtomic(
  destination: string,
  content: string | Uint8Array,
  mode: number = 0o600,
): Promise<void> {
  const temporary = `${destination}.partial-${crypto.randomUUID()}`;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode });
    await replaceFileAtomic(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
