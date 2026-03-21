// SPDX-License-Identifier: MIT
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { RawData } from '../ISerialDataParser';

export interface ParseResult {
  results: RawData[];
  remaining: Buffer;
}

export interface IManufacturerParser {
  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult;
}
