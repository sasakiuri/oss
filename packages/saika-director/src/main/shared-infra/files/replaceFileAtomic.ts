// SPDX-License-Identifier: MIT
import { rename, unlink } from 'node:fs/promises';

/**
 * Moves a fully written file over `destination`. The previous destination is moved aside first and put back
 * when the move fails, so readers see either the old or the new file.
 */
export async function replaceFileAtomic(source: string, destination: string): Promise<void> {
  const displaced = `${destination}.previous-${crypto.randomUUID()}`;
  let hadDestination = false;
  try {
    await rename(destination, displaced);
    hadDestination = true;
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  try {
    await rename(source, destination);
  } catch (error) {
    if (hadDestination) await rename(displaced, destination).catch(() => undefined);
    throw error;
  }
  // The replacement is already committed. A failed cleanup must not report the write as failed or overwrite the
  // new file; the displaced copy stays behind as a recoverable artifact.
  if (hadDestination) await unlink(displaced).catch(() => undefined);
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
