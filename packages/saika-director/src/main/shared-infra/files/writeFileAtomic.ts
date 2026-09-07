// SPDX-License-Identifier: MIT
import { writeFile, rename, unlink } from 'node:fs/promises';

export async function writeFileAtomic(destination: string, content: string | Uint8Array): Promise<void> {
  const temporary = `${destination}.partial-${crypto.randomUUID()}`;
  const displaced = `${destination}.previous-${crypto.randomUUID()}`;
  let hadDestination = false;
  try {
    await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
    try {
      await rename(destination, displaced);
      hadDestination = true;
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (hadDestination) await rename(displaced, destination).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  if (hadDestination) await unlink(displaced).catch(() => undefined);
}
