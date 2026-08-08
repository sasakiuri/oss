// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { ImpactPoint } from '@/main/modules/session/domain/ImpactPoint';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

import type { AdapterContext } from './AdapterContext';
import { RedDotFrameDecodeError, RedDotFrameDecoder } from './disag/RedDotFrameDecoder';
import { ITargetAdapter } from './ITargetAdapter';

const DISTANCE_TOLERANCE_RAW = 0.100001;

/** Converts validated DISAG RedDot frames into the common Shot entity. */
export class DisagAdapter implements ITargetAdapter {
  private readonly decoder = new RedDotFrameDecoder();

  /**
   * Converts RawData to a Shot object.
   */
  convert(rawData: RawData, context: AdapterContext): Shot {
    try {
      if (rawData.manufacturer.value !== 'DISAG') {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'RedDot frame must use the DISAG manufacturer',
          manufacturer: rawData.manufacturer.value,
        });
      }

      if (!context.discipline.equals(Discipline.airRifle10m())) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'DISAG RedDot Rifle only supports AIR_RIFLE_10M',
          discipline: context.discipline.value,
        });
      }

      const parsed = this.decoder.decode(rawData.raw);
      const expectedDistanceRaw = Math.hypot(parsed.xRaw, parsed.yRaw);
      if (Math.abs(parsed.distanceRaw - expectedDistanceRaw) > DISTANCE_TOLERANCE_RAW) {
        getLogger().warn('[RedDot] Frame distance differs from coordinates', 'usb', {
          code: 'DISTANCE_MISMATCH',
        });
      }

      const impactPoint = new ImpactPoint(parsed.xMm, parsed.yMm);
      const score = new Score(parsed.scoreTenths);
      const targetDesign = TargetDesign.forDiscipline(context.discipline);

      return Shot.create({
        impactPoint,
        score,
        mode: context.mode,
        timestamp: rawData.timestamp,
        shotNumber: context.shotNumber,
        seriesNumber: 0,
        innerTen: targetDesign.isInnerTen(impactPoint),
        deviceScore: score,
      });
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }

      const frameErrorCode = error instanceof RedDotFrameDecodeError ? error.code : undefined;
      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          manufacturer: 'DISAG',
          rawDataLength: rawData.raw.length,
          ...(frameErrorCode === undefined ? {} : { frameErrorCode }),
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
