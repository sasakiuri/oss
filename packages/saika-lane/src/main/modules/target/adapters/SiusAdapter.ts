// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import { ITargetAdapter } from './ITargetAdapter';

/**
 * SIUS adapter stub (not yet implemented).
 */
export class SiusAdapter implements ITargetAdapter {
  /** Unsupported adapter. Always throws DATA_CONVERSION_ERROR. */
  convert(_rawData: RawData): Shot {
    throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
      reason: 'SIUS support is not yet available in this version',
      manufacturer: 'SIUS',
    });
  }
}
