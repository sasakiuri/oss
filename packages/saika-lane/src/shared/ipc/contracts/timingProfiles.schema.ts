// SPDX-License-Identifier: MIT
import { z } from 'zod';

import { TimedTargetTimingSettingsSchema } from '@/shared/mqtt/TimedTargetTimingSettings';
import { TimingEvidenceReportSchema } from '@/shared/mqtt/TimingEvidenceReport';

import { TimingMeasurementRequestSchema, TimingMeasurementEvidenceSchema } from './timingMeasurements.schema';

const revision = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(200);
export const TimingProfileInputSchema = z.object({
  id: uuid,
  name: text,
  installationReference: z.string().trim().min(1).max(1000),
  measurementReference: z.string().trim().min(1).max(2000),
  measuredBy: text,
  measuredAt: z.string().datetime(),
  validUntil: z.string().datetime().optional(),
  settings: TimedTargetTimingSettingsSchema.extend({ mode: z.literal('BOUNDED') }),
});
export const TimingProfileSchema = TimingProfileInputSchema.extend({
  connectionRevision: revision,
  connectionLabel: z.string(),
  recordedAt: z.string().datetime(),
  installationRevision: uuid.optional(),
  installationDescription: z.string().max(1000).optional(),
  measurementEvidence: TimingMeasurementEvidenceSchema.optional(),
});
export const TimingProfileApplicationSchema = z.object({
  id: uuid,
  profileId: uuid,
  officialName: text,
  appliedAt: z.string().datetime(),
});
export const TimingProfileStoreSchema = z.object({
  installation: z
    .object({
      revision: uuid,
      description: z.string().trim().min(1).max(1000),
      officialName: text,
      recordedAt: z.string().datetime(),
    })
    .optional(),
  profiles: z.array(TimingProfileSchema),
  applications: z.array(TimingProfileApplicationSchema),
  activeApplicationId: uuid.nullable(),
});
export const TimingProfileStatusSchema = TimingProfileStoreSchema.extend({
  revision,
  connectionLabel: z.string(),
  evidence: TimingEvidenceReportSchema.optional(),
  settings: TimedTargetTimingSettingsSchema,
  state: z.enum(['MANUAL', 'ACTIVE', 'REVIEW_REQUIRED']),
  issue: z.string().nullable(),
});
export const SaveTimingProfileSchema = TimingProfileInputSchema.extend({
  expectedRevision: revision,
  measurements: TimingMeasurementRequestSchema.optional(),
});
export const ApplyTimingProfileSchema = z.object({
  profileId: uuid,
  expectedRevision: revision,
  installationConfirmed: z.literal(true),
  officialName: text,
});
export const RecordTimingInstallationSchema = z.object({
  expectedRevision: revision,
  description: z.string().trim().min(1).max(1000),
  officialName: text,
});
export type RecordTimingInstallation = z.infer<typeof RecordTimingInstallationSchema>;
export type TimingProfile = z.infer<typeof TimingProfileSchema>;
export type TimingProfileStore = z.infer<typeof TimingProfileStoreSchema>;
export type TimingProfileStatus = z.infer<typeof TimingProfileStatusSchema>;
export type SaveTimingProfile = z.infer<typeof SaveTimingProfileSchema>;
export type ApplyTimingProfile = z.infer<typeof ApplyTimingProfileSchema>;
