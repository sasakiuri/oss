// SPDX-License-Identifier: MIT
/**
 * MQTT IPC Contract
 *
 * @description
 * Defines Zod-based contracts for MQTT-related IPC channels.
 * Covers MQTT connection commands and status/settings queries.
 */

import { z } from 'zod';

import { command, CommandResponseSchema, defineContract, query, queryResponseSchema } from '../defineContract';

// ============================================================
// Shared schemas
// ============================================================

/** Regex for validating MQTT broker URLs (mqtt:// or mqtts://) */
const mqttUrlPattern = /^mqtts?:\/\//;

/** Regex to detect userinfo (username:password@) in a URL */
const userinfoPattern = /^mqtts?:\/\/[^@/]+@/;

const MqttSettingsSchema = z.object({
  enabled: z.boolean(),
  brokerUrl: z
    .string()
    .refine((v) => v === '' || mqttUrlPattern.test(v), { message: 'Must be empty or a valid mqtt:// / mqtts:// URL' })
    .refine((v) => !userinfoPattern.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    }),
  laneAlias: z.string().default(''),
  autoConnect: z.boolean().default(false),
  laneId: z.string().uuid(),
});

const MqttStatusSchema = z.object({
  status: z.union([z.literal('connected'), z.literal('disconnected'), z.literal('connecting')]),
  brokerUrl: z
    .string()
    .refine((v) => v === '' || mqttUrlPattern.test(v), { message: 'Must be empty or a valid mqtt:// / mqtts:// URL' })
    .refine((v) => !userinfoPattern.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    })
    .optional(),
  laneId: z.string().optional(),
});

// ============================================================
// Command input schemas
// ============================================================

const ConnectMqttInputSchema = z.object({
  brokerUrl: z
    .string()
    .regex(mqttUrlPattern)
    .refine((v) => !userinfoPattern.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    }),
  laneAlias: z.string().optional(),
  autoConnect: z.boolean().optional(),
});

// ============================================================
// Contract definition
// ============================================================

export const mqttContract = defineContract('mqtt', {
  connectMqtt: command(ConnectMqttInputSchema, CommandResponseSchema, {
    channel: 'mqtt:connect',
  }),
  disconnectMqtt: command(CommandResponseSchema, {
    channel: 'mqtt:disconnect',
  }),
  getMqttStatus: query(queryResponseSchema(MqttStatusSchema), {
    channel: 'mqtt:getStatus',
  }),
  saveMqttSettings: command(MqttSettingsSchema, CommandResponseSchema, {
    channel: 'mqtt:saveSettings',
  }),
  getMqttSettings: query(queryResponseSchema(MqttSettingsSchema), {
    channel: 'mqtt:getSettings',
  }),
});

// ============================================================
// Exported inferred types
// ============================================================

export type MqttSettings = z.infer<typeof MqttSettingsSchema>;
export type MqttStatus = z.infer<typeof MqttStatusSchema>;
export type ConnectMqttInput = z.infer<typeof ConnectMqttInputSchema>;
