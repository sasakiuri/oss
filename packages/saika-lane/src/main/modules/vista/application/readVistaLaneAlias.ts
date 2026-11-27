// SPDX-License-Identifier: MIT
import { VistaIdentitySchema } from '@sasakiuri/saika-protocol/Vista';

import { readMirroredLaneAlias } from '@/main/modules/settings/application/MirroredSettings';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** Vista names and labels share one text limit. */
const VISTA_TEXT_LIMIT = VistaIdentitySchema.shape.name.maxLength ?? Number.POSITIVE_INFINITY;
/** Room for the " · <event>" that subject labels append to the Lane name. */
const LABEL_SUFFIX_ALLOWANCE = 256;

/**
 * Returns the saved Lane Alias when Vista can carry it in the source name and in subject labels;
 * otherwise null, so the caller keeps the numbered Lane name.
 */
export function readVistaLaneAlias(storage: Pick<ILocalStorage, 'get'>): string | null {
  const alias = readMirroredLaneAlias(storage);
  return alias && alias.length + LABEL_SUFFIX_ALLOWANCE <= VISTA_TEXT_LIMIT ? alias : null;
}
