// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';

import type { AdapterContext } from './AdapterContext';

/** Converts a target record to a shot using the supplied session context. */
export interface ITargetAdapter {
  /**
   * @throws DATA_CONVERSION_ERROR when parsing fails.
   * @throws VALIDATION_ERROR when shot values are invalid.
   */
  convert(rawData: RawData, context: AdapterContext): Shot;
}
