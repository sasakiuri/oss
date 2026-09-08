// SPDX-License-Identifier: MIT
import {
  DEFAULT_TIMED_TARGET_TIMING_SETTINGS,
  TimedTargetTimingSettingsSchema,
  type TimedTargetTimingSettings,
} from '@/shared/mqtt/TimedTargetTimingSettings';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

const KEY = 'timedTarget.timingSettings';

export function readTimingSettings(storage: Pick<ILocalStorage, 'get'>): TimedTargetTimingSettings {
  const saved = storage.get<unknown>(KEY);
  return TimedTargetTimingSettingsSchema.parse(saved ?? DEFAULT_TIMED_TARGET_TIMING_SETTINGS);
}

export function writeTimingSettings(storage: Pick<ILocalStorage, 'set'>, input: TimedTargetTimingSettings): void {
  storage.set(KEY, TimedTargetTimingSettingsSchema.parse(input));
}
