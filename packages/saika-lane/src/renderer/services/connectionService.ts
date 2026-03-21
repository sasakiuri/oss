// SPDX-License-Identifier: MIT
import type { GetDevicesByManufacturerDto, ListPortsDto, TargetManufacturer } from '@/shared/ipc/contracts';

import { createCommandMethod, createServiceMethod, createVoidServiceMethod } from './createServiceMethod';

export const connectionService = {
  connect: createServiceMethod<
    {
      portName: string;
      manufacturer: TargetManufacturer;
      deviceId?: string;
      baudRate?: number;
    },
    { connectionId: string }
  >((input) => window.electronAPI.usb.connect(input)),

  disconnect: createCommandMethod<{ connectionId: string }>((input) => window.electronAPI.usb.disconnect(input)),

  listPorts: createVoidServiceMethod<ListPortsDto>(() => window.electronAPI.usb.listPorts()),

  getDevicesByManufacturer: createServiceMethod<{ manufacturer: TargetManufacturer }, GetDevicesByManufacturerDto>(
    (input) => window.electronAPI.usb.getDevicesByManufacturer(input),
  ),
};
