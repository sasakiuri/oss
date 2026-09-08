// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { TimedTargetStateSchema } from '@/shared/mqtt/TimedTargetState';
import { TimedTargetTimingSettingsSchema } from '@/shared/mqtt/TimedTargetTimingSettings';

import { command, commandDataResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

import { TimingMeasurementRequestSchema, TimingMeasurementAnalysisSchema } from './timingMeasurements.schema';
import {
  TimingProfileStatusSchema,
  SaveTimingProfileSchema,
  ApplyTimingProfileSchema,
  RecordTimingInstallationSchema,
} from './timingProfiles.schema';

export const timedTargetContract = defineContract('timedTarget', {
  analyzeMeasurements: command(
    TimingMeasurementRequestSchema,
    commandDataResponseSchema(TimingMeasurementAnalysisSchema),
  ),
  getTimingProfiles: query(queryResponseSchema(TimingProfileStatusSchema)),
  recordTimingInstallation: command(
    RecordTimingInstallationSchema,
    commandDataResponseSchema(TimingProfileStatusSchema),
  ),
  saveTimingProfile: command(SaveTimingProfileSchema, commandDataResponseSchema(TimingProfileStatusSchema)),
  applyTimingProfile: command(ApplyTimingProfileSchema, commandDataResponseSchema(TimingProfileStatusSchema)),
  getState: query(queryResponseSchema(TimedTargetStateSchema.nullable())),
  getTimingSettings: query(queryResponseSchema(TimedTargetTimingSettingsSchema)),
  setTimingSettings: command(
    TimedTargetTimingSettingsSchema,
    commandDataResponseSchema(TimedTargetTimingSettingsSchema),
  ),
  cancel: command(
    z.object({ sequenceId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
    commandDataResponseSchema(TimedTargetStateSchema),
  ),
});

export type TimedTargetStateDto = z.infer<typeof TimedTargetStateSchema>;
