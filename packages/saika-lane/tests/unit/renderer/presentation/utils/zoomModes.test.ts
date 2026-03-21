// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import {
  type ZoomMode,
  ZOOM_MODE_LABELS,
  ZOOM_MODE_SEQUENCE,
  getNextZoomMode,
  getPrevZoomMode,
} from '@/renderer/presentation/utils/zoomModes';

describe('ZOOM_MODE_SEQUENCE', () => {
  it('contains 5 modes', () => {
    expect(ZOOM_MODE_SEQUENCE).toHaveLength(5);
  });

  it('is defined in the correct order', () => {
    expect(ZOOM_MODE_SEQUENCE).toEqual(['AUTO', 'RING_8', 'RING_6', 'RING_4', 'FULL']);
  });

  it('has no duplicate modes', () => {
    const unique = new Set(ZOOM_MODE_SEQUENCE);
    expect(unique.size).toBe(ZOOM_MODE_SEQUENCE.length);
  });
});

describe('ZOOM_MODE_LABELS', () => {
  it('has corresponding labels for all modes', () => {
    for (const mode of ZOOM_MODE_SEQUENCE) {
      expect(ZOOM_MODE_LABELS[mode]).toBeDefined();
      expect(typeof ZOOM_MODE_LABELS[mode]).toBe('string');
      expect(ZOOM_MODE_LABELS[mode].length).toBeGreaterThan(0);
    }
  });

  it('has correct label values for each mode', () => {
    expect(ZOOM_MODE_LABELS.AUTO).toBe('Auto');
    expect(ZOOM_MODE_LABELS.RING_8).toBe('8-ring');
    expect(ZOOM_MODE_LABELS.RING_6).toBe('6-ring');
    expect(ZOOM_MODE_LABELS.RING_4).toBe('4-ring');
    expect(ZOOM_MODE_LABELS.FULL).toBe('Full');
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
    // After going through all prev, we should be back at AUTO
    current = getPrevZoomMode(current);
    expect(current).toBe('FULL');
  });
});
