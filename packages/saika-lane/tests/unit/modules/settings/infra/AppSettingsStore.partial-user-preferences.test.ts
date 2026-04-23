// SPDX-License-Identifier: MIT
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppSettingsStore } from '@/main/modules/settings/infra/AppSettingsStore';

import { createMockStorage } from '../../../../helpers/mockDependencies';

describe('AppSettingsStore userPreferences migration', () => {
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

  it('recovers missing user preference fields from legacy storage when settings.json only preserves laneNumber', () => {
    storage.set('userPreferences', {
      laneNumber: 7,
      discipline: 'AIR_RIFLE_10M',
      competitionTypeId: 'qualification',
      audioVolume: 70,
    });
    writeFileSync(
      filePath,
      JSON.stringify(
        {
          userPreferences: {
            laneNumber: 7,
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const store = new AppSettingsStore({ filePath, storage });

    expect(store.getUserPreferences()).toEqual({
      laneNumber: 7,
      discipline: 'AIR_RIFLE_10M',
      competitionTypeId: 'qualification',
      audioVolume: 70,
    });
  });
});
