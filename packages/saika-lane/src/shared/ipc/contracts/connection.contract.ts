// SPDX-License-Identifier: MIT
/**
 * Connection IPC Contract
 *
 * @description
 * Defines Zod-based contracts for USB connection-related IPC channels.
 * Covers device connection/disconnection commands and port/device listing queries.
 */

import { z } from 'zod';

import {
  CommandResponseSchema,
  command,
  commandDataResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';
import { TargetManufacturerSchema } from '../schemas/common';

// ============================================================
// Shared enums / literals
// ============================================================

const DisciplineSchema = z.union([
  z.literal('AIR_RIFLE_10M'),
  z.literal('AIR_PISTOL_10M'),
  z.literal('RIFLE_50M'),
  z.literal('PISTOL_25M'),
  z.literal('BEAM_RIFLE_10M'),
  z.literal('BEAM_PISTOL_10M'),
]);

// ============================================================
// Command input schemas
// ============================================================

const ConnectInputSchema = z.object({
  portName: z.string().regex(/^(COM\d+|\/dev\/(tty(USB|ACM|S|AMA)\S*|cu\.\S+|serial\/by-id\/\S+))$/, {
    message: 'Must be a valid serial port path (e.g. COM1, /dev/ttyUSB0, /dev/cu.usbserial-1)',
  }),
  manufacturer: TargetManufacturerSchema,
  deviceId: z.string().optional(),
  baudRate: z.number().optional(),
});

const DisconnectInputSchema = z.object({
  connectionId: z.string(),
});

// ============================================================
// Query input schemas
// ============================================================

const GetDevicesByManufacturerInputSchema = z.object({
  manufacturer: TargetManufacturerSchema,
});

// ============================================================
// Response schemas
// ============================================================

const ConnectResponseSchema = commandDataResponseSchema(z.object({ connectionId: z.string() }));

const PortInfoSchema = z.object({
  path: z.string(),
  manufacturer: z.string().optional(),
  serialNumber: z.string().optional(),
  vendorId: z.string().optional(),
  productId: z.string().optional(),
});

const ListPortsDtoSchema = z.object({
  ports: z.array(PortInfoSchema),
});

const TargetDeviceDtoSchema = z.object({
  id: z.string(),
  manufacturer: TargetManufacturerSchema,
  displayName: z.string(),
  baudRate: z.number(),
  supportedDisciplines: z.array(DisciplineSchema),
});

const GetDevicesByManufacturerDtoSchema = z.object({
  devices: z.array(TargetDeviceDtoSchema),
});

// ============================================================
// Contract definition
// ============================================================

export const connectionContract = defineContract('connection', {
  connect: command(ConnectInputSchema, ConnectResponseSchema, {
    channel: 'usb:connect',
  }),
  disconnect: command(DisconnectInputSchema, CommandResponseSchema, {
    channel: 'usb:disconnect',
  }),
  listPorts: query(queryResponseSchema(ListPortsDtoSchema), {
    channel: 'usb:listPorts',
  }),
  getDevicesByManufacturer: query(
    GetDevicesByManufacturerInputSchema,
    queryResponseSchema(GetDevicesByManufacturerDtoSchema),
    { channel: 'usb:getDevicesByManufacturer' },
  ),
});

// ============================================================
// Exported inferred types
// ============================================================

export type ConnectInput = z.infer<typeof ConnectInputSchema>;
export type DisconnectInput = z.infer<typeof DisconnectInputSchema>;
export type GetDevicesByManufacturerInput = z.infer<typeof GetDevicesByManufacturerInputSchema>;
export type PortInfo = z.infer<typeof PortInfoSchema>;
export type ListPortsDto = z.infer<typeof ListPortsDtoSchema>;
export type TargetDeviceDto = z.infer<typeof TargetDeviceDtoSchema>;
export type GetDevicesByManufacturerDto = z.infer<typeof GetDevicesByManufacturerDtoSchema>;
export type ConnectResponse = z.infer<typeof ConnectResponseSchema>;
export type TargetManufacturer = z.infer<typeof TargetManufacturerSchema>;
