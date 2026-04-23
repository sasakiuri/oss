// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';

import { createMockStorage } from '../../../../helpers/mockDependencies';

describe('AppSettingsStore mqtt migration', () => {
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

  it('recovers missing mqtt fields from legacy storage when settings.json only preserves the enabled flag', () => {
    storage.set('mqtt.settings', {
      enabled: true,
      brokerUrl: 'mqtt://broker.example.com:1883',
      laneAlias: 'Lane 7',
      autoConnect: true,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    });
    storage.set('mqtt.laneId', '550e8400-e29b-41d4-a716-446655440000');
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          mqtt: {
            enabled: true,
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });

    expect(store.getMqttSettings()).toEqual({
      enabled: true,
      brokerUrl: 'mqtt://broker.example.com:1883',
      laneAlias: 'Lane 7',
      autoConnect: true,
      laneId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });
});
