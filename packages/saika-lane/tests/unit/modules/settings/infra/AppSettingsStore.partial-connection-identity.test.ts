// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';

import { createMockStorage } from '../../../../helpers/mockDependencies';

describe('AppSettingsStore connection migration', () => {
  let tempDir: string;
  let filePath: string;
  let storage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'saika-lane-settings-'));
    filePath = join(tempDir, 'settings.json');
    storage = createMockStorage();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('recovers missing USB identity fields from legacy storage when settings.json keeps the same saved port', () => {
    storage.set('connectionSettings', {
      portName: 'COM9',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          connection: {
            portName: 'COM9',
            manufacturer: 'KOHTO',
            deviceId: 'MT201',
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });

    expect(store.getConnectionSettings()).toEqual({
      portName: 'COM9',
      manufacturer: 'KOHTO',
      deviceId: 'MT201',
      serialNumber: 'ABC123',
      vendorId: '0403',
      productId: '6001',
    });
  });
});
