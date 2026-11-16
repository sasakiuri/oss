// SPDX-License-Identifier: MIT
import { ShotTimingSettingsSchema } from '@sasakiuri/saika-protocol/ShotTimingSettings';

import { DEFAULT_TIMED_TARGET_TIMING_SETTINGS } from '@/main/modules/timing-profiles/domain/DefaultTimingSettings';
import { TimingProfileStoreSchema } from '@/shared/ipc/contracts/timingProfiles.schema';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { ITimingProfileStore, TimingProfileState } from '../application/TimingProfileService';

const KEY = 'timedTarget.timingProfiles';
const SETTINGS_KEY = 'timedTarget.timingSettings';
/** Keeps the existing settings key readable by older installations and commits both values in one store write. */
export class StoredTimingProfiles implements ITimingProfileStore {
  constructor(private readonly storage: Pick<ILocalStorage, 'get' | 'setMany'>) {}
  load(): TimingProfileState {
    return {
      ...TimingProfileStoreSchema.parse(
        this.storage.get(KEY) ?? { profiles: [], applications: [], activeApplicationId: null },
      ),
      settings: ShotTimingSettingsSchema.parse(this.storage.get(SETTINGS_KEY) ?? DEFAULT_TIMED_TARGET_TIMING_SETTINGS),
    };
  }
  write(state: TimingProfileState): void {
    this.storage.setMany({
      [KEY]: TimingProfileStoreSchema.parse(state),
      [SETTINGS_KEY]: ShotTimingSettingsSchema.parse(state.settings),
    });
  }
}
