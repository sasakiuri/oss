// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { AppUpdateStateSchema, AppUpdateStatusSchema } from '../src/state';
import { UpdaterService } from '../src/UpdaterService';

describe('update state contract', () => {
  const initial = new UpdaterService({ currentVersion: '1.0.0', isPackaged: true }).getState();

  it.each(['unsupported', 'idle', 'checking', 'available', 'downloading', 'downloaded', 'no-update', 'error'])(
    'accepts the %s status',
    (status) => {
      expect(AppUpdateStatusSchema.parse(status)).toBe(status);
      expect(AppUpdateStateSchema.parse({ ...initial, status })).toEqual({ ...initial, status });
    },
  );

  it('rejects unknown statuses and incomplete states', () => {
    expect(AppUpdateStatusSchema.safeParse('ready').success).toBe(false);
    expect(AppUpdateStateSchema.safeParse({}).success).toBe(false);
    for (const field of Object.keys(initial)) {
      const missing = { ...initial } as Record<string, unknown>;
      delete missing[field];
      expect(AppUpdateStateSchema.safeParse(missing).success).toBe(false);
    }
  });

  it.each(['downloadPercent', 'transferredBytes', 'totalBytes', 'bytesPerSecond'])(
    'checks nullable nonnegative %s',
    (field) => {
      for (const value of [null, 0, 50, 100]) {
        expect(AppUpdateStateSchema.safeParse({ ...initial, [field]: value }).success).toBe(true);
      }
      for (const value of [-0.1, '10', NaN, Infinity]) {
        expect(AppUpdateStateSchema.safeParse({ ...initial, [field]: value }).success).toBe(false);
      }
    },
  );

  it('limits percentage independently of byte counts', () => {
    expect(AppUpdateStateSchema.safeParse({ ...initial, downloadPercent: 100.1 }).success).toBe(false);
    expect(AppUpdateStateSchema.safeParse({ ...initial, totalBytes: 1024 }).success).toBe(true);
  });
});
