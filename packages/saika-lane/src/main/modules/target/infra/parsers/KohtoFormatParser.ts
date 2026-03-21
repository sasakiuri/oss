// SPDX-License-Identifier: MIT
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

import type { RawData } from '../ISerialDataParser';

import type { IManufacturerParser, ParseResult } from './IManufacturerParser';

export class KohtoFormatParser implements IManufacturerParser {
  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult {
    const results: RawData[] = [];
    const timestamp = new Date();

    const lines = buffer.toString('utf-8').split('\n');

    const logger = getLogger();
    if (logger.isLevelEnabled('debug')) {
      logger.debug('[Parser] Kohto parse', 'usb', {
        bufferLength: buffer.length,
        bufferContent: buffer.toString('utf-8').replace(/\r?\n/g, '\\n'),
        linesCount: lines.length,
        parsedLines: lines.map((l) => l.replace(/\r/g, '\\r')),
      });
    }

    const incompleteLine = lines.pop() || '';
    const remaining = Buffer.from(incompleteLine, 'utf-8');

    for (const line of lines) {
      if (line.trim().length === 0) {
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
