// SPDX-License-Identifier: MIT
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { AdapterContext } from './AdapterContext';
import { ITargetAdapter } from './ITargetAdapter';
import { MT201CoordinateConverter } from './mt201/MT201CoordinateConverter';
import { MT201DataParser } from './mt201/MT201DataParser';
import { MT201ShotFactory } from './mt201/MT201ShotFactory';

/**
 * MT201Adapter (Kohto Electronics MT201 target adapter)
 *
 * Acts as a facade, delegating the responsibilities of parsing, coordinate conversion,
 * and Shot creation to specialized classes.
 *
 * @see MT201DataParser - Parsing MT201 binary data
 * @see MT201CoordinateConverter - Converting HEX coordinates to mm-unit ImpactPoint
 * @see MT201ShotFactory - Creating Shot/miss shot
 */
export class MT201Adapter implements ITargetAdapter {
  private readonly dataParser = new MT201DataParser();
  private readonly coordinateConverter = new MT201CoordinateConverter();
  private readonly shotFactory = new MT201ShotFactory();

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
    const logger = getLogger();

    try {
      logger.debug('[MT201] Converting raw data', 'usb', {
        rawLength: rawData.raw.length,
        rawHex: rawData.raw.toString('hex'),
        rawUtf8: rawData.raw.toString('utf-8'),
      });

      // 1. Parse
      const parsedData = this.dataParser.parse(rawData.raw);
      logger.debug('[MT201] Parsed data', 'usb', {
        mode: parsedData.mode,
        score: parsedData.score,
        xHex: parsedData.xHex,
        yHex: parsedData.yHex,
        checksum: parsedData.checksum,
      });

      // P0-4: Device mode takes priority (use parsedData.mode: "R"→MATCH, "S"→SIGHTING)
      const deviceMode: Mode = parsedData.mode === 'R' ? Mode.match() : Mode.sighting();
      const effectiveContext: AdapterContext = { ...context, mode: deviceMode };

      // 2. Miss shot determination
      // parsedData.score is the raw float value from the device parser (before ×10 conversion)
      const isMiss = parsedData.xHex === '7FFF' && parsedData.yHex === '7FFF' && parsedData.score === 0.0;

      if (isMiss) {
        return this.shotFactory.createMissShot(rawData.timestamp, effectiveContext);
      }

      // 3. Coordinate conversion
      const impactPoint = this.coordinateConverter.toImpactPoint(parsedData.xHex, parsedData.yHex);
      logger.debug('[MT201] Converted coordinates', 'usb', {
        x: impactPoint.x,
        y: impactPoint.y,
      });

      // 4. X ring determination (physical geometry)
      const targetDesign = TargetDesign.forDiscipline(context.discipline);
      const innerTen = targetDesign.isInnerTen(impactPoint);

      // 5. Create Score + Create Shot
      const score = new Score(Math.round(parsedData.score * 10));
      return this.shotFactory.createShot(impactPoint, score, rawData.timestamp, effectiveContext, innerTen);
    } catch (error) {
      // Re-throw DomainError as-is
      if (error instanceof DomainError) {
        throw error;
      }

      // For Score validation errors, preserve the message and wrap
      if (error instanceof Error && error.message.includes('Score value')) {
        throw DomainError.wrap(error, 'DATA_CONVERSION_ERROR', 'Data conversion failed');
      }

      // Wrap other errors in DATA_CONVERSION_ERROR
      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          manufacturer: 'MT201',
          rawDataLength: rawData.raw.length,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
