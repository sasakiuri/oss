// SPDX-License-Identifier: MIT
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';

import type { AdapterContext } from './AdapterContext';

/**
 * ITargetAdapter interface
 *
 * Adapter interface that converts manufacturer-specific format RawData to a common Shot object.
 * Adopts the adapter pattern to abstract each manufacturer's specific implementation.
 *
 * Design principles:
 * - Functions as a port (interface) in hexagonal architecture
 * - Hides manufacturer-specific data formats
 * - Responsible for converting to Shot entities
 * - Unified error handling via ErrorCatalog
 * - Stateless: session state is injected from outside as AdapterContext
 *
 * @example
 * ```typescript
 * // CustomAdapter usage example
 * const adapter: ITargetAdapter = new CustomAdapter();
 * const rawData: RawData = {
 *   raw: Buffer.from('12.5,-8.3,ABC\n'),
 *   timestamp: new Date(),
 *   manufacturer: TargetManufacturer.custom()
 * };
 * const context: AdapterContext = {
 *   shotNumber: 1,
 *   discipline: Discipline.airRifle10m(),
 *   mode: Mode.sighting(),
 * };
 *
 * const shot = adapter.convert(rawData, context);
 * console.log(`Shot #${shot.shotNumber}: ${shot.score.value} points`);
 * ```
 */
export interface ITargetAdapter {
  /**
   * Converts RawData to a Shot object.
   *
   * Parses manufacturer-specific formats and creates a Shot entity containing
   * ImpactPoint, Score, and other metadata.
   *
   * Conversion process:
   * 1. Parse the RawData buffer (CSV, binary, JSON, etc.)
   * 2. Extract X/Y coordinates and create ImpactPoint
   * 3. Calculate score using ScoreCalculationService
   * 4. Create and return the Shot entity
   *
   * @param rawData - RawData to convert
   * @param context - Adapter context (shot number, discipline, mode)
   * @returns Created Shot entity
   * @throws DATA_CONVERSION_ERROR - If data conversion fails
   * @throws VALIDATION_ERROR - If data format is invalid
   *
   * @example
   * ```typescript
   * // Convert CUSTOM format (CSV)
   * const customAdapter = new CustomAdapter();
   * const rawData = {
   *   raw: Buffer.from('12.5,-8.3,ABC\n'),
   *   timestamp: new Date('2024-01-15T10:30:00Z'),
   *   manufacturer: TargetManufacturer.custom()
   * };
   * const context: AdapterContext = {
   *   shotNumber: 1,
   *   discipline: Discipline.airRifle10m(),
   *   mode: Mode.sighting(),
   * };
   *
   * try {
   *   const shot = customAdapter.convert(rawData, context);
   *   console.log(`X: ${shot.impactPoint.x}, Y: ${shot.impactPoint.y}`);
   *   console.log(`Score: ${shot.score.value}`);
   * } catch (error) {
   *   if (error instanceof DomainError) {
   *     console.error(error.userMessage);
   *   }
   * }
   * ```
   */
  convert(rawData: RawData, context: AdapterContext): Shot;
}
