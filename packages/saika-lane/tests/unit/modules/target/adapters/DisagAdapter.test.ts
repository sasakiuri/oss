// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { DisagAdapter } from '@/main/modules/target/adapters/DisagAdapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';
import { DomainError } from '@/shared/errors/DomainError';

import { replaceRedDotAscii, validRedDotFrame } from '../../../../helpers/redDotFixtures';

const loggerMocks = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: loggerMocks.warn,
    error: vi.fn(),
  }),
}));

describe('DisagAdapter', () => {
  const adapter = new DisagAdapter();
  const timestamp = new Date('2026-08-08T00:00:00.000Z');

  it('creates an AIR_RIFLE_10M Shot with device score and millimetre coordinates', () => {
    const shot = adapter.convert(rawData(validRedDotFrame()), context(Mode.sighting()));

    expect(shot.impactPoint).toMatchObject({ x: 3, y: 4 });
    expect(shot.score.value).toBe(90);
    expect(shot.deviceScore?.value).toBe(90);
    expect(shot.timestamp).toEqual(timestamp);
    expect(shot.mode.value).toBe('SIGHTING');
    expect(shot.shotNumber).toBe(1);
    expect(shot.seriesNumber).toBe(0);
    expect(shot.innerTen).toBe(false);
  });

  it.each([
    [Mode.sighting(), 'SIGHTING'],
    [Mode.match(), 'MATCH'],
  ])('uses the current session mode rather than a wire mode', (mode, expected) => {
    expect(adapter.convert(rawData(validRedDotFrame()), context(mode)).mode.value).toBe(expected);
  });

  it('accepts a distance mismatch and logs a diagnostic warning', () => {
    loggerMocks.warn.mockClear();
    const frame = replaceRedDotAscii(validRedDotFrame(), 37, '0499.0');

    const shot = adapter.convert(rawData(frame), context(Mode.match()));

    expect(shot.impactPoint).toMatchObject({ x: 3, y: 4 });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining('distance'),
      'usb',
      expect.objectContaining({ code: 'DISTANCE_MISMATCH' }),
    );
  });

  it('rejects a non-air-rifle context', () => {
    expect(() =>
      adapter.convert(rawData(validRedDotFrame()), {
        ...context(Mode.match()),
        discipline: Discipline.airPistol10m(),
      }),
    ).toThrow();
  });

  it('rejects an invalid frame through DATA_CONVERSION_ERROR', () => {
    const frame = validRedDotFrame();
    frame[57] = frame[57]! ^ 0x01;

    try {
      adapter.convert(rawData(frame), context(Mode.match()));
      expect.fail('Expected conversion to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('DATA_CONVERSION_ERROR');
      expect((error as DomainError).metadata).toMatchObject({
        manufacturer: 'DISAG',
        frameErrorCode: 'INVALID_BCC',
      });
    }
  });

  function rawData(raw: Buffer): RawData {
    return {
      raw,
      timestamp,
      manufacturer: TargetManufacturer.disag(),
    };
  }

  function context(mode: Mode): AdapterContext {
    return {
      shotNumber: 1,
      discipline: Discipline.airRifle10m(),
      mode,
    };
  }
});
