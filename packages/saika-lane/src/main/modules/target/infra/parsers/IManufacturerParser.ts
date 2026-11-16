// SPDX-License-Identifier: MIT
import type { RawData } from '@/main/modules/target/domain/ISerialDataParser';
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

export interface ParseResult {
  results: RawData[];
  remaining: Buffer;
}

export interface IManufacturerParser {
  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult;
}
