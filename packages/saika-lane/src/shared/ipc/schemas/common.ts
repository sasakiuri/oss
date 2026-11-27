// SPDX-License-Identifier: MIT
import { z } from 'zod';

export const TargetManufacturerSchema = z.union([
  z.literal('SIUS'),
  z.literal('MEYTON'),
  z.literal('DISAG'),
  z.literal('CUSTOM'),
  z.literal('KOHTO'),
]);

export type TargetManufacturer = z.infer<typeof TargetManufacturerSchema>;

export const DisciplineSchema = z.union([
  z.literal('AIR_RIFLE_10M'),
  z.literal('AIR_PISTOL_10M'),
  z.literal('RIFLE_50M'),
  z.literal('RIFLE_300M'),
  z.literal('PISTOL_50M'),
  z.literal('PISTOL_25M'),
  z.literal('BEAM_RIFLE_10M'),
  z.literal('BEAM_PISTOL_10M'),
]);

export type Discipline = z.infer<typeof DisciplineSchema>;

/** Scoring method: RING scores whole rings, DECIMAL scores tenths. */
export const ScoringAccSchema = z.enum(['RING', 'DECIMAL']);

export type ScoringAcc = z.infer<typeof ScoringAccSchema>;

export const InterruptionStatusSchema = z.enum(['PAUSED', 'RESUME_PENDING', 'SIGHTING', 'RUNNING_MATCH']);

export const MqttConnectionStatusSchema = z.enum(['connected', 'disconnected', 'connecting']);

/** Matches an mqtt:// or mqtts:// URL. */
export const MQTT_URL_PATTERN = /^mqtts?:\/\//;

/** Matches a broker URL with userinfo (username:password@). */
export const MQTT_USERINFO_PATTERN = /^mqtts?:\/\/[^@/]+@/;

/** A saved broker URL: empty, or an mqtt:// / mqtts:// URL without credentials. */
export const MqttBrokerUrlSchema = z
  .string()
  .refine((v) => v === '' || MQTT_URL_PATTERN.test(v), { message: 'Must be empty or a valid mqtt:// / mqtts:// URL' })
  .refine((v) => !MQTT_USERINFO_PATTERN.test(v), {
    message: 'Broker URL must not contain credentials (username:password@)',
  });
