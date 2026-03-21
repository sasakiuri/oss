// SPDX-License-Identifier: MIT
import type { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';

/**
 * Raw data type definition
 *
 * Represents parsed raw data.
 * Contains binary data received via USB and associated metadata.
 */
export interface RawData {
  /**
   * Raw data (Buffer)
   *
   * Binary data received in manufacturer-specific format.
   * Converted to ImpactPoint or Score in subsequent conversion processing.
   */
  raw: Buffer;

  /**
   * Reception timestamp
   *
   * Exact timestamp when the data was received.
   * Used as the time information for shot records.
   */
  timestamp: Date;

  /**
   * Manufacturer type
   *
   * Used for routing parse processing and subsequent conversion processing.
   */
  manufacturer: TargetManufacturer;
}

/**
 * ISerialDataParser interface
 *
 * Interface providing serial data parsing functionality.
 * Parses raw data (Buffer) received via USB and converts it
 * to structured RawData objects.
 *
 * Design principles:
 * - Functions as a port (interface) in hexagonal architecture
 * - Hides manufacturer-specific protocol details
 * - Handles partial data reception via buffering
 * - Unified error handling (using ErrorCatalog)
 *
 * @example
 * ```typescript
 * const parser: ISerialDataParser = new SerialDataParser(SerialDataParser.defaultParsers());
 *
 * // Parse CUSTOM format (CSV)
 * const buffer = Buffer.from('12.5,-8.3,ABC\n');
 * const results = parser.parse(buffer, TargetManufacturer.custom());
 *
 * results.forEach(data => {
 *   console.log(`Received at: ${data.timestamp}`);
 *   console.log(`Manufacturer: ${data.manufacturer.displayName}`);
 *   console.log(`Raw data length: ${data.raw.length} bytes`);
 * });
 * ```
 */
export interface ISerialDataParser {
  /**
   * Parses Buffer data.
   *
   * Parses received serial data and converts it to structured RawData objects
   * according to manufacturer-specific formats.
   *
   * This method handles partial data reception.
   * Data accumulates in the internal buffer until a complete message is received,
   * at which point the parse result is returned.
   *
   * @param chunk - Received Buffer data
   * @param manufacturer - Target manufacturer
   * @returns Array of parsed RawData (empty array if no complete message)
   * @throws USB_PARSE_ERROR - If parsing fails
   *
   * @example
   * ```typescript
   * const parser = new SerialDataParser(SerialDataParser.defaultParsers());
   *
   * // First partial data
   * const chunk1 = Buffer.from('12.5,');
   * const result1 = parser.parse(chunk1, TargetManufacturer.custom());
   * // => [] (empty array because message is incomplete)
   *
   * // Remaining data
   * const chunk2 = Buffer.from('-8.3,ABC\n');
   * const result2 = parser.parse(chunk2, TargetManufacturer.custom());
   * // => [{ raw: Buffer, timestamp: Date, manufacturer: TargetManufacturer }]
   * ```
   */
  parse(chunk: Buffer, manufacturer: TargetManufacturer): RawData[];

  /**
   * Clears the internal buffer.
   *
   * Resets the internal buffer on timeout or error.
   * Normally does not need to be called explicitly from the application layer.
   *
   * @example
   * ```typescript
   * const parser = new SerialDataParser(SerialDataParser.defaultParsers());
   *
   * // Clear the buffer on timeout, etc.
   * parser.clearBuffer();
   * ```
   */
  clearBuffer(): void;
}
