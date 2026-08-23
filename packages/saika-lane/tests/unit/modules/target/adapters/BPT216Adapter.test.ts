// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { AdapterContext } from '@/main/modules/target/adapters/AdapterContext';
import { BPT216Adapter } from '@/main/modules/target/adapters/BPT216Adapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { RawData } from '@/main/modules/target/infra/ISerialDataParser';

describe('BPT216Adapter', () => {
  const adapter = new BPT216Adapter();
  const timestamp = new Date('2026-08-14T00:00:00.000Z');

  it('creates a Beam Pistol shot with device score and 0.01 mm coordinates', () => {
    const shot = adapter.convert(rawData('10.90,123,-456,0,0,T'), context(Mode.match()));

    expect(shot.impactPoint).toMatchObject({ x: 1.23, y: -4.56 });
    expect(shot.score.value).toBe(109);
    expect(shot.deviceScore?.value).toBe(109);
    expect(shot.mode.value).toBe('MATCH');
    expect(shot.timestamp).toEqual(timestamp);
    expect(shot.shotNumber).toBe(4);
    expect(shot.innerTen).toBe(true);
  });

  it('uses the active Saika Lane mode because the BPT frame has no match/sighting field', () => {
    expect(adapter.convert(rawData('9.70,600,0,0,0,T'), context(Mode.sighting())).mode.value).toBe('SIGHTING');
  });

  it('converts a captured RS-232C frame as a Beam Pistol shot', () => {
    const shot = adapter.convert(rawData('P 6.9 FAC3 F474 4F'), context(Mode.sighting()));

    expect(shot.impactPoint).toMatchObject({ x: -13.41, y: -29.56 });
    expect(shot.score.value).toBe(69);
    expect(shot.deviceScore?.value).toBe(69);
    expect(shot.mode.value).toBe('SIGHTING');
  });

  it('does not apply the BP-217 status sentinel to an RS-232C coordinate', () => {
    const shot = adapter.convert(rawData('P 5.0 270F 0000 02'), context(Mode.match()));

    expect(shot.impactPoint).toMatchObject({ x: 99.99, y: 0 });
    expect(shot.score.value).toBe(50);
  });

  it.each(['0.0,0,0,0,0,R', '0.0,0,0,0,0,B'])('rejects non-shot frame %s', (frame) => {
    expect(() => adapter.convert(rawData(frame), context(Mode.match()))).toThrow();
  });

  it('rejects the version/status sentinel as a shot', () => {
    expect(() => adapter.convert(rawData('0.0,9999,0,0,0,T,2.01'), context(Mode.match()))).toThrow();
  });

  it('rejects another discipline or manufacturer', () => {
    expect(() =>
      adapter.convert(rawData('9.7,0,0,0,0,T'), {
        ...context(Mode.match()),
        discipline: Discipline.airPistol10m(),
      }),
    ).toThrow();
    expect(() =>
      adapter.convert(
        { ...rawData('9.7,0,0,0,0,T'), manufacturer: TargetManufacturer.custom() },
        context(Mode.match()),
      ),
    ).toThrow();
  });

  function rawData(frame: string): RawData {
    return { raw: Buffer.from(frame), timestamp, manufacturer: TargetManufacturer.kohto() };
  }

  function context(mode: Mode): AdapterContext {
    return { shotNumber: 4, discipline: Discipline.beamPistol10m(), mode };
  }
});
