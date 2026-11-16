// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

/** Hex SHA-256 of `JSON.stringify(value)`. Stored revisions and digests depend on these exact bytes. */
export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
