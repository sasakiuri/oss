// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';

import type { AdapterContext } from './AdapterContext';
import type { RawData } from './ISerialDataParser';

/** Converts a received target record into a shot through the registered device adapters. */
export interface ITargetDataConverter {
  /** @throws DATA_CONVERSION_ERROR when no adapter is registered for the record's manufacturer. */
  convert(rawData: RawData, context: AdapterContext): Shot;
  /** @throws DATA_CONVERSION_ERROR when no adapter is registered for the device. */
  convertByDeviceId(rawData: RawData, deviceId: string, context: AdapterContext): Shot;
}
