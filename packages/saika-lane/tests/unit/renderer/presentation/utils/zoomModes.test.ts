// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { TARGET_RADII } from '@/renderer/presentation/components/target/targetRadii';
import { calculateFixedZoom } from '@/renderer/presentation/utils/zoomFixed';
import {
  type ZoomMode,
  ZOOM_MODE_SEQUENCE,
  getNextZoomMode,
  getPrevZoomMode,
} from '@/renderer/presentation/utils/zoomModes';
import type { Discipline } from '@/shared/ipc/contracts';

describe('ZOOM_MODE_SEQUENCE', () => {
  it('contains 5 modes', () => {
    expect(ZOOM_MODE_SEQUENCE).toHaveLength(5);
  });

  it('is defined in the correct order', () => {
    expect(ZOOM_MODE_SEQUENCE).toEqual(['AUTO', 'FULL', 'RING_4', 'RING_6', 'RING_8']);
  });

  it('has no duplicate modes', () => {
    const unique = new Set(ZOOM_MODE_SEQUENCE);
    expect(unique.size).toBe(ZOOM_MODE_SEQUENCE.length);
  });
});

describe('getNextZoomMode - full cycle through all modes', () => {
  it('cycles through ZOOM_MODE_SEQUENCE and returns to the start', () => {
    let current: ZoomMode = 'AUTO';
    for (let i = 0; i < ZOOM_MODE_SEQUENCE.length; i++) {
      expect(current).toBe(ZOOM_MODE_SEQUENCE[i]);
      current = getNextZoomMode(current);
    }
    expect(current).toBe('AUTO');
  });
});

describe('getPrevZoomMode - full reverse cycle through all modes', () => {
  it('cycles through ZOOM_MODE_SEQUENCE in reverse and returns to the start', () => {
    let current: ZoomMode = 'AUTO';
    for (let i = ZOOM_MODE_SEQUENCE.length - 1; i >= 0; i--) {
      current = getPrevZoomMode(current);
      expect(current).toBe(ZOOM_MODE_SEQUENCE[i]);
    }
    // One more step back from AUTO wraps to the end of the sequence again
    current = getPrevZoomMode(current);
    expect(current).toBe('RING_8');
  });
});

describe('zoom direction', () => {
  function stepsFromAuto(step: (current: ZoomMode) => ZoomMode): ZoomMode[] {
    const modes: ZoomMode[] = [];
    for (let current = step('AUTO'); current !== 'AUTO'; current = step(current)) modes.push(current);
    return modes;
  }

  it.each(Object.keys(TARGET_RADII) as Discipline[])(
    'Zoom In raises the %s magnification at every step until it wraps to AUTO',
    (discipline) => {
      const zooms = stepsFromAuto(getNextZoomMode).map((mode) =>
        calculateFixedZoom(mode, discipline, TARGET_RADII[discipline]),
      );

      expect(zooms).toHaveLength(4);
      zooms.slice(1).forEach((zoom, index) => expect(zoom).toBeGreaterThan(zooms[index]!));
    },
  );

  it('Zoom Out starts at the closest view and lowers the magnification to the whole target', () => {
    expect(stepsFromAuto(getPrevZoomMode)).toEqual(['RING_8', 'RING_6', 'RING_4', 'FULL']);
  });
});
