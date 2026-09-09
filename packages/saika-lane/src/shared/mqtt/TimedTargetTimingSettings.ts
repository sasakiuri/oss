// SPDX-License-Identifier: MIT
import type { ShotTimingSettings } from '@sasakiuri/saika-protocol/ShotTimingSettings';

export {
  ShotTimingSettingsSchema as TimedTargetTimingSettingsSchema,
  type ShotTimingSettings as TimedTargetTimingSettings,
} from '@sasakiuri/saika-protocol/ShotTimingSettings';

/** Lane policy defaults are separate from the transport contract. */
export const DEFAULT_TIMED_TARGET_TIMING_SETTINGS: ShotTimingSettings = Object.freeze({
  mode: 'BOUNDED',
  maximumReceiptDelayMilliseconds: null,
  clockUncertaintyMilliseconds: null,
});
