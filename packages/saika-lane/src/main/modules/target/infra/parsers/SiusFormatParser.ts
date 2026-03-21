// SPDX-License-Identifier: MIT

import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { RawData } from '../ISerialDataParser';

import type { IManufacturerParser, ParseResult } from './IManufacturerParser';

export class SiusFormatParser implements IManufacturerParser {
  private readonly MESSAGE_LENGTH = 32;

  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult {
    const results: RawData[] = [];
    const timestamp = new Date();

    let offset = 0;

    while (buffer.length - offset >= this.MESSAGE_LENGTH) {
      const message = buffer.subarray(offset, offset + this.MESSAGE_LENGTH);
      offset += this.MESSAGE_LENGTH;

      const rawData: RawData = Object.freeze({
        raw: Buffer.from(message),
        timestamp,
        manufacturer,
      });

      results.push(rawData);
    }

    const remaining = buffer.subarray(offset);

    return { results, remaining };
  }
}
