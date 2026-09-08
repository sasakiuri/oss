import type { TimedTargetStateDto } from '@/shared/ipc/contracts';
import type {
  TimingMeasurementRequest,
  TimingMeasurementAnalysis,
} from '@/shared/ipc/contracts/timingMeasurements.schema';
import type {
  TimingProfileStatus,
  SaveTimingProfile,
  ApplyTimingProfile,
  RecordTimingInstallation,
} from '@/shared/ipc/contracts/timingProfiles.schema';
import type { TimedTargetTimingSettings } from '@/shared/mqtt/TimedTargetTimingSettings';

import { createServiceMethod, createVoidServiceMethod } from './createServiceMethod';

export const timedTargetService = {
  recordTimingInstallation: createServiceMethod<RecordTimingInstallation, TimingProfileStatus>((input) =>
    window.electronAPI.timedTarget.recordTimingInstallation(input),
  ),
  analyzeMeasurements: createServiceMethod<TimingMeasurementRequest, TimingMeasurementAnalysis>((input) =>
    window.electronAPI.timedTarget.analyzeMeasurements(input),
  ),
  getTimingProfiles: createVoidServiceMethod<TimingProfileStatus>(() =>
    window.electronAPI.timedTarget.getTimingProfiles(),
  ),
  saveTimingProfile: createServiceMethod<SaveTimingProfile, TimingProfileStatus>((input) =>
    window.electronAPI.timedTarget.saveTimingProfile(input),
  ),
  applyTimingProfile: createServiceMethod<ApplyTimingProfile, TimingProfileStatus>((input) =>
    window.electronAPI.timedTarget.applyTimingProfile(input),
  ),
  getTimingSettings: createVoidServiceMethod<TimedTargetTimingSettings>(() =>
    window.electronAPI.timedTarget.getTimingSettings(),
  ),
  setTimingSettings: createServiceMethod<TimedTargetTimingSettings, TimedTargetTimingSettings>((input) =>
    window.electronAPI.timedTarget.setTimingSettings(input),
  ),
  getState: createVoidServiceMethod<TimedTargetStateDto | null>(() => window.electronAPI.timedTarget.getState()),
  cancel: createServiceMethod<{ sequenceId: string; reason: string }, TimedTargetStateDto>((input) =>
    window.electronAPI.timedTarget.cancel(input),
  ),
};
