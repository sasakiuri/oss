// SPDX-License-Identifier: MIT

import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { ISerialDataParser, RawData } from './ISerialDataParser';
import { CustomFormatParser } from './parsers/CustomFormatParser';
import { DisagFormatParser } from './parsers/DisagFormatParser';
import type { IManufacturerParser } from './parsers/IManufacturerParser';
import { KohtoFormatParser } from './parsers/KohtoFormatParser';
import { MeytonFormatParser } from './parsers/MeytonFormatParser';
import { SiusFormatParser } from './parsers/SiusFormatParser';

export class SerialDataParser implements ISerialDataParser {
  private buffer: Buffer = Buffer.alloc(0);
  private lastDataTimestamp: Date | null = null;
  private readonly TIMEOUT_MS = 1000;
  private readonly MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

  constructor(private readonly parsers: Record<string, IManufacturerParser>) {}

  static defaultParsers(): Record<string, IManufacturerParser> {
    return {
      CUSTOM: new CustomFormatParser(),
      SIUS: new SiusFormatParser(),
      MEYTON: new MeytonFormatParser(),
      DISAG: new DisagFormatParser(),
      KOHTO: new KohtoFormatParser(),
    };
  }

  parse(chunk: Buffer, manufacturer: TargetManufacturer): RawData[] {
    if (this.checkTimeout()) {
      this.clearBuffer();
    }

    this.lastDataTimestamp = new Date();
    this.buffer = Buffer.concat([this.buffer, chunk]);

    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.clearBuffer();
      throw ErrorCatalog.createError('USB_PARSE_ERROR', {
        manufacturer: manufacturer.value,
        reason: `Buffer exceeded maximum size (${this.MAX_BUFFER_SIZE} bytes)`,
      });
    }

    const strategy = this.parsers[manufacturer.value];
    if (!strategy) {
      throw ErrorCatalog.createError('USB_PARSE_ERROR', {
        manufacturer: manufacturer.value,
        reason: 'Unsupported manufacturer',
      });
    }

    const { results, remaining } = strategy.parse(this.buffer, manufacturer);
    this.buffer = remaining;

    return Object.freeze(results) as RawData[];
  }

  clearBuffer(): void {
    this.buffer = Buffer.alloc(0);
    this.lastDataTimestamp = null;
  }

  private checkTimeout(): boolean {
    if (this.lastDataTimestamp === null) {
      return false;
    }

    const now = new Date();
    const elapsed = now.getTime() - this.lastDataTimestamp.getTime();

    return elapsed >= this.TIMEOUT_MS;
  }
}
