// SPDX-License-Identifier: MIT
import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '@sasakiuri/saika-ipc';
import {
  EstComplaintIssueSchema,
  EstComplaintSignalContextSchema,
  EstComplaintSignalPayloadSchema,
} from '@sasakiuri/saika-protocol/EstComplaintSignal';
import { QualificationMalfunctionSignalPayloadSchema } from '@sasakiuri/saika-protocol/QualificationMalfunctionSignal';
import { RangeOfficerRequestPayloadSchema } from '@sasakiuri/saika-protocol/RangeOfficerRequest';
import { z } from 'zod';

import {
  MQTT_URL_PATTERN,
  MQTT_USERINFO_PATTERN,
  MqttBrokerUrlSchema,
  MqttConnectionStatusSchema,
} from '../schemas/common';

// ============================================================
// Shared schemas
// ============================================================

const MqttSettingsSchema = z.object({
  enabled: z.boolean(),
  brokerUrl: MqttBrokerUrlSchema,
  laneAlias: z.string().default(''),
  autoConnect: z.boolean().default(false),
  laneId: z.string().uuid(),
});

const MqttStatusSchema = z.object({
  error: z.string().optional(),
  status: MqttConnectionStatusSchema,
  brokerUrl: MqttBrokerUrlSchema.optional(),
  laneId: z.string().optional(),
});

export const DirectorMembershipDtoSchema = z.object({
  competitionId: z.string().min(1).nullable(),
  revision: z.number().int().nonnegative(),
});

export const LaneSafetyStateDtoSchema = z.object({
  status: z.enum(['STOPPED', 'CLEAR']),
  safetyStopId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  stoppedBy: z.string().nullable(),
  stoppedAt: z.string().datetime().nullable(),
  timerSnapshot: z
    .object({
      competitionId: z.string(),
      remainingSeconds: z.number().int().nonnegative(),
      totalSeconds: z.number().int().nonnegative(),
      frozenAt: z.string().datetime(),
    })
    .nullable(),
  clearedBy: z.string().nullable(),
  clearanceReason: z.string().nullable(),
  clearedAt: z.string().datetime().nullable(),
});

// ============================================================
// Command input schemas
// ============================================================

const ConnectMqttInputSchema = z.object({
  brokerUrl: z
    .string()
    .regex(MQTT_URL_PATTERN)
    .refine((v) => !MQTT_USERINFO_PATTERN.test(v), {
      message: 'Broker URL must not contain credentials (username:password@)',
    }),
  laneAlias: z.string().optional(),
  autoConnect: z.boolean().optional(),
});

const RequestRangeOfficerInputSchema = z.object({
  category: z.enum(['ASSISTANCE', 'EQUIPMENT', 'TARGET', 'SCORING', 'SAFETY', 'OTHER']),
  message: z.string().trim().max(500).optional(),
});

const ClearRangeOfficerRequestInputSchema = z.object({ requestId: z.string().uuid() });

const DeclareQualificationMalfunctionInputSchema = z.object({
  message: z.string().trim().max(500).optional(),
});

const ClearQualificationMalfunctionSignalInputSchema = z.object({ signalId: z.string().uuid() });

const DeclareEstComplaintInputSchema = z.object({
  issue: EstComplaintIssueSchema,
  message: z.string().trim().max(500).optional(),
});

const ClearEstComplaintSignalInputSchema = z.object({ signalId: z.string().uuid() });

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
  getDirectorMembership: query(queryResponseSchema(DirectorMembershipDtoSchema), {
    channel: 'mqtt:getDirectorMembership',
  }),
  getSafetyState: query(queryResponseSchema(LaneSafetyStateDtoSchema), {
    channel: 'mqtt:getSafetyState',
  }),
  getRangeOfficerRequest: query(queryResponseSchema(RangeOfficerRequestPayloadSchema), {
    channel: 'mqtt:getRangeOfficerRequest',
  }),
  requestRangeOfficer: command(
    RequestRangeOfficerInputSchema,
    commandDataResponseSchema(RangeOfficerRequestPayloadSchema),
    { channel: 'mqtt:requestRangeOfficer' },
  ),
  clearRangeOfficerRequest: command(
    ClearRangeOfficerRequestInputSchema,
    commandDataResponseSchema(RangeOfficerRequestPayloadSchema),
    { channel: 'mqtt:clearRangeOfficerRequest' },
  ),
  getQualificationMalfunctionSignal: query(queryResponseSchema(QualificationMalfunctionSignalPayloadSchema), {
    channel: 'mqtt:getQualificationMalfunctionSignal',
  }),
  declareQualificationMalfunction: command(
    DeclareQualificationMalfunctionInputSchema,
    commandDataResponseSchema(QualificationMalfunctionSignalPayloadSchema),
    { channel: 'mqtt:declareQualificationMalfunction' },
  ),
  clearQualificationMalfunctionSignal: command(
    ClearQualificationMalfunctionSignalInputSchema,
    commandDataResponseSchema(QualificationMalfunctionSignalPayloadSchema),
    { channel: 'mqtt:clearQualificationMalfunctionSignal' },
  ),
  getEstComplaintSignal: query(queryResponseSchema(EstComplaintSignalPayloadSchema), {
    channel: 'mqtt:getEstComplaintSignal',
  }),
  getEstComplaintContext: query(queryResponseSchema(EstComplaintSignalContextSchema), {
    channel: 'mqtt:getEstComplaintContext',
  }),
  declareEstComplaint: command(
    DeclareEstComplaintInputSchema,
    commandDataResponseSchema(EstComplaintSignalPayloadSchema),
    { channel: 'mqtt:declareEstComplaint' },
  ),
  clearEstComplaintSignal: command(
    ClearEstComplaintSignalInputSchema,
    commandDataResponseSchema(EstComplaintSignalPayloadSchema),
    { channel: 'mqtt:clearEstComplaintSignal' },
  ),
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
export type LaneSafetyStateDto = z.infer<typeof LaneSafetyStateDtoSchema>;
export type ConnectMqttInput = z.infer<typeof ConnectMqttInputSchema>;
export type RequestRangeOfficerInput = z.infer<typeof RequestRangeOfficerInputSchema>;
export type ClearRangeOfficerRequestInput = z.infer<typeof ClearRangeOfficerRequestInputSchema>;
export type RangeOfficerRequestDto = z.infer<typeof RangeOfficerRequestPayloadSchema>;
export type DeclareQualificationMalfunctionInput = z.infer<typeof DeclareQualificationMalfunctionInputSchema>;
export type ClearQualificationMalfunctionSignalInput = z.infer<typeof ClearQualificationMalfunctionSignalInputSchema>;
export type QualificationMalfunctionSignalDto = z.infer<typeof QualificationMalfunctionSignalPayloadSchema>;
export type DeclareEstComplaintInput = z.infer<typeof DeclareEstComplaintInputSchema>;
export type ClearEstComplaintSignalInput = z.infer<typeof ClearEstComplaintSignalInputSchema>;
export type EstComplaintSignalDto = z.infer<typeof EstComplaintSignalPayloadSchema>;
export type EstComplaintContextDto = z.infer<typeof EstComplaintSignalContextSchema>;

export type DirectorMembershipDto = z.infer<typeof DirectorMembershipDtoSchema>;
