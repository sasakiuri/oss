// SPDX-License-Identifier: MIT

import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { RawData } from '../ISerialDataParser';

import type { IManufacturerParser, ParseResult } from './IManufacturerParser';

export class DisagFormatParser implements IManufacturerParser {
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

      if (!line.includes('<shot>') || !line.includes('</shot>')) {
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
