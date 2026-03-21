// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import type { Phase } from '@/main/modules/competition/domain/Phase';

describe('Phase type', () => {
  it('IDLE phase can be used', () => {
    const phase: Phase = 'IDLE';
    expect(phase).toBe('IDLE');
  });

  it('ACTIVE phase can be used', () => {
    const phase: Phase = 'ACTIVE';
    expect(phase).toBe('ACTIVE');
  });

  it('SERIES_COMPLETE phase can be used', () => {
    const phase: Phase = 'SERIES_COMPLETE';
    expect(phase).toBe('SERIES_COMPLETE');
  });

  it('SERIES_ENTERED phase can be used', () => {
    const phase: Phase = 'SERIES_ENTERED';
    expect(phase).toBe('SERIES_ENTERED');
  });

  it('STAGE_ENTERED phase can be used', () => {
    const phase: Phase = 'STAGE_ENTERED';
    expect(phase).toBe('STAGE_ENTERED');
  });

  it('FINISHED phase can be used', () => {
    const phase: Phase = 'FINISHED';
    expect(phase).toBe('FINISHED');
  });

  it('all 6 phases are distinguishable', () => {
    const phases: Phase[] = ['IDLE', 'ACTIVE', 'SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED', 'FINISHED'];
    const uniquePhases = new Set(phases);
    expect(uniquePhases.size).toBe(6);
  });
});
