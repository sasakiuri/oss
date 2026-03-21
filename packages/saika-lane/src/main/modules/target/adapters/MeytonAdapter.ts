// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { ITargetAdapter } from './ITargetAdapter';

/**
 * Meyton adapter stub (not yet implemented).
 */
export class MeytonAdapter implements ITargetAdapter {
  /**
   * Converts RawData to a Shot object.
   *
   * Not yet implemented. Always throws DATA_CONVERSION_ERROR.
   *
   * @param rawData - RawData to convert
   * @returns Created Shot entity
   * @throws DATA_CONVERSION_ERROR - Meyton support is not yet available
   */
  convert(_rawData: RawData): Shot {
    throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
      reason: 'Meyton support is not yet available in this version',
      manufacturer: 'MEYTON',
    });
  }
}
