// SPDX-License-Identifier: MIT

import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

import type { RawData } from '../ISerialDataParser';

import { RedDotStreamScanner } from './disag/RedDotStreamScanner';
import type { IManufacturerParser, ParseResult } from './IManufacturerParser';

export class DisagFormatParser implements IManufacturerParser {
  parse(buffer: Buffer, manufacturer: TargetManufacturer): ParseResult {
    // SerialDataParser owns the retained buffer, so this wrapper intentionally
    // creates a stateless scanner for the complete buffer passed to it.
    const scanner = new RedDotStreamScanner();
    const events = scanner.push(buffer);
    const results: RawData[] = events
      .filter((event) => event.type === 'frame')
      .map((event) =>
        Object.freeze({
          raw: Buffer.from(event.frame),
          timestamp: new Date(event.receivedAt.getTime()),
          manufacturer,
        }),
      );

    return { results, remaining: scanner.getRemainingBuffer() };
  }
}
