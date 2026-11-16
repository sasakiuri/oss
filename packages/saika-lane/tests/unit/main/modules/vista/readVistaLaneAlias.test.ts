// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { readVistaLaneAlias } from '@/main/modules/vista/application/readVistaLaneAlias';

function storageWith(laneAlias?: string) {
  return { get: <T>(key: string) => (key === 'mqtt.settings' ? ({ laneAlias } as T) : undefined) };
}

describe('readVistaLaneAlias', () => {
  it('returns the saved alias', () => {
    expect(readVistaLaneAlias(storageWith('Lane Seven'))).toBe('Lane Seven');
  });

  it('returns null without a saved alias', () => {
    expect(readVistaLaneAlias(storageWith(''))).toBeNull();
    expect(readVistaLaneAlias(storageWith())).toBeNull();
    expect(readVistaLaneAlias({ get: () => undefined })).toBeNull();
  });

  it('accepts an alias that leaves room for the event in a 2048-character label', () => {
    expect(readVistaLaneAlias(storageWith('x'.repeat(1792)))).toBe('x'.repeat(1792));
  });

  it('returns null for an alias Vista could not carry in its names and labels', () => {
    expect(readVistaLaneAlias(storageWith('x'.repeat(1793)))).toBeNull();
    expect(readVistaLaneAlias(storageWith('x'.repeat(4096)))).toBeNull();
  });
});
