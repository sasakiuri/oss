// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const connectionService = {
  connect: createServiceMethod((api) => api.usb.connect),
  disconnect: createServiceMethod((api) => api.usb.disconnect),
  listPorts: createServiceMethod((api) => api.usb.listPorts),
  getDevicesByManufacturer: createServiceMethod((api) => api.usb.getDevicesByManufacturer),
};
