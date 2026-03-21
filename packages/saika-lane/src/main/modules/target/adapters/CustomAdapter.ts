// SPDX-License-Identifier: MIT
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

import type { AdapterContext } from './AdapterContext';
import { ITargetAdapter } from './ITargetAdapter';

/**
 * CustomAdapter (Custom target adapter)
 *
 * Adapter that converts CSV-format data sent from custom targets to Shot objects.
 * Stateless design: session state (shot number, discipline, mode) is injected via AdapterContext.
 *
 * CSV format: "X coordinate,Y coordinate,metadata\n" (e.g. "12.5,-8.3,ABC\n")
 *
 * Conversion flow:
 * 1. Parse CSV data (extract X, Y coordinates)
 * 2. Create ImpactPoint
 * 3. Calculate score using TargetDesign
 * 4. Create Shot entity
 *
 * Error handling:
 * - Invalid CSV format → DATA_CONVERSION_ERROR
 * - Invalid coordinate values → VALIDATION_ERROR
 * - Other errors → DATA_CONVERSION_ERROR
 *
 * @example
 * ```typescript
 * const adapter = new CustomAdapter();
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
export class CustomAdapter implements ITargetAdapter {
  /**
   * Converts RawData to a Shot object.
   *
   * @param rawData - RawData to convert
   * @param context - Adapter context (shot number, discipline, mode)
   * @returns Created Shot entity
   * @throws DATA_CONVERSION_ERROR - If data conversion fails
   * @throws VALIDATION_ERROR - If data format is invalid
   */
  convert(rawData: RawData, context: AdapterContext): Shot {
    try {
      // 1. Parse CSV data
      const csvData = this.parseCSV(rawData.raw);

      // 2. Create ImpactPoint
      const impactPoint = this.createImpactPoint(csvData.x, csvData.y);

      // 3. Calculate score using TargetDesign
      const targetDesign = TargetDesign.forDiscipline(context.discipline);
      const score = targetDesign.calculateScore(impactPoint);

      // 4. Determine X ring (physical geometry)
      const innerTen = targetDesign.isInnerTen(impactPoint);

      // 5. Create Shot entity
      const shot = Shot.create({
        impactPoint,
        score,
        mode: context.mode,
        timestamp: rawData.timestamp,
        shotNumber: context.shotNumber,
        seriesNumber: 0, // Shots created by adapter are unassigned to a series
        innerTen,
      });

      return shot;
    } catch (error) {
      // Re-throw DomainError as-is
      if (isDomainError(error)) {
        throw error;
      }

      // Wrap other errors in DATA_CONVERSION_ERROR
      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          manufacturer: 'CUSTOM',
          rawDataLength: rawData.raw.length,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Parses CSV data.
   *
   * CSV format: "X coordinate,Y coordinate,metadata\n"
   * Example: "12.5,-8.3,ABC\n" → { x: 12.5, y: -8.3, metadata: "ABC" }
   *
   * @param buffer - Buffer containing CSV data
   * @returns Parse result (X coordinate, Y coordinate, metadata)
   * @throws DATA_CONVERSION_ERROR - If CSV format is invalid
   */
  private parseCSV(buffer: Buffer): { x: number; y: number; metadata: string } {
    try {
      // Convert Buffer to string (UTF-8)
      const csvString = buffer.toString('utf-8').trim();

      // Split by comma
      const parts = csvString.split(',');

      // Format validation: at least 2 fields (X, Y) are required
      if (parts.length < 2) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'CSV format requires at least 2 fields (X, Y)',
          receivedFields: parts.length,
        });
      }

      // Parse X coordinate
      const x = parseFloat(parts[0]?.trim() ?? '');
      if (!Number.isFinite(x)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'x',
          value: parts[0],
        });
      }

      // Parse Y coordinate
      const y = parseFloat(parts[1]?.trim() ?? '');
      if (!Number.isFinite(y)) {
        throw ErrorCatalog.createError('VALIDATION_ERROR', {
          field: 'y',
          value: parts[1],
        });
      }

      // Metadata (optional)
      const metadata = parts[2]?.trim() ?? '';

      return { x, y, metadata };
    } catch (error) {
      // Re-throw DomainError as-is
      if (isDomainError(error)) {
        throw error;
      }

      // Wrap other errors in DATA_CONVERSION_ERROR
      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          stage: 'CSV parsing',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Creates an ImpactPoint from X/Y coordinates.
   *
   * @param x - X coordinate (in mm)
   * @param y - Y coordinate (in mm)
   * @returns ImpactPoint instance
   * @throws VALIDATION_ERROR - If coordinate values are invalid (thrown by ImpactPoint constructor)
   */
  private createImpactPoint(x: number, y: number): ImpactPoint {
    try {
      return new ImpactPoint(x, y);
    } catch (error) {
      throw ErrorCatalog.createError(
        'VALIDATION_ERROR',
        {
          field: 'impactPoint',
          x,
          y,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
