// SPDX-License-Identifier: MIT
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

/** A received target record and its reception metadata. */
export interface RawData {
  /** Target-specific bytes, before coordinate and score conversion. */
  raw: Buffer;

  /** Reception time used for the shot record. */
  timestamp: Date;

  /** Identifies the parser and adapter for this record. */
  manufacturer: TargetManufacturer;
}

/** Splits serial input into records, buffering incomplete data between calls. */
export interface ISerialDataParser {
  /**
   * Returns complete records, or an empty array while more data is needed.
   * @throws USB_PARSE_ERROR when parsing fails.
   */
  parse(chunk: Buffer, manufacturer: TargetManufacturer): RawData[];

  /** Discards any incomplete record. */
  clearBuffer(): void;
}
