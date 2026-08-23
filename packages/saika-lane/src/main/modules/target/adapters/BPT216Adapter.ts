// SPDX-License-Identifier: MIT
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Score } from '@/main/modules/session/domain/Score';
import { Shot } from '@/main/modules/session/domain/Shot';
import { TargetDesign } from '@/main/modules/target/domain/TargetDesign';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { isDomainError } from '@/shared/errors/isDomainError';

import type { AdapterContext } from './AdapterContext';
import { BPT216CoordinateConverter } from './bpt216/BPT216CoordinateConverter';
import { BPT216DataParser } from './bpt216/BPT216DataParser';
import { ITargetAdapter } from './ITargetAdapter';

/** Converts Kohto BPT-216 shot frames into the common Shot entity. */
export class BPT216Adapter implements ITargetAdapter {
  private readonly parser = new BPT216DataParser();
  private readonly coordinateConverter = new BPT216CoordinateConverter();

  convert(rawData: RawData, context: AdapterContext): Shot {
    try {
      if (rawData.manufacturer.value !== 'KOHTO') {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'BPT-216 frame must use the KOHTO manufacturer',
          manufacturer: rawData.manufacturer.value,
        });
      }
      if (!context.discipline.equals(Discipline.beamPistol10m())) {
        throw ErrorCatalog.createError('DATA_CONVERSION_ERROR', {
          reason: 'BPT-216 only supports BEAM_PISTOL_10M',
          discipline: context.discipline.value,
        });
      }

      const parsed = this.parser.parse(rawData.raw);
      const impactPoint = this.coordinateConverter.toImpactPoint(parsed.xRaw, parsed.yRaw);
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
      throw ErrorCatalog.createError(
        'DATA_CONVERSION_ERROR',
        {
          manufacturer: 'BPT-216',
          rawDataLength: rawData.raw.length,
        },
        error instanceof Error ? error : undefined,
      );
    }
  }
}
