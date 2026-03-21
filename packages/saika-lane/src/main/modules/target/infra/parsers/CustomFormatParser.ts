// SPDX-License-Identifier: MIT

import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { RawData } from '../ISerialDataParser';

import type { IManufacturerParser, ParseResult } from './IManufacturerParser';

export class CustomFormatParser implements IManufacturerParser {
  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult {
    const results: RawData[] = [];
    const timestamp = new Date();

    const lines = buffer.toString('utf-8').split('\n');

    const incompleteLine = lines.pop() || '';
    const remaining = Buffer.from(incompleteLine, 'utf-8');

    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }

      const fields = line.split(',');

      if (fields.length !== 3) {
        continue;
      }

      const rawData: RawData = Object.freeze({
        raw: Buffer.from(line, 'utf-8'),
        timestamp,
        manufacturer,
      });

      results.push(rawData);
    }

    return { results, remaining };
  }
}
