// SPDX-License-Identifier: MIT
import type { InferHandlers } from '@sasakiuri/saika-ipc';

import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import type { IUSBConnectionManager } from '@/main/modules/connection/domain/IUSBConnectionManager';
import type { ITargetConnectionSupport } from '@/main/modules/target/domain/TargetConnectionSupport';
import { TargetDevice } from '@/main/modules/target/domain/TargetDevice';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { connectionContract } from '@/shared/ipc/contracts';

export interface ConnectionIpcHandlersDeps {
  commandBus: CommandBus;
  usbManager: IUSBConnectionManager;
  targetConnectionSupport: ITargetConnectionSupport;
}

export function createConnectionIpcHandlers(deps: ConnectionIpcHandlersDeps): InferHandlers<typeof connectionContract> {
  const { commandBus, usbManager, targetConnectionSupport } = deps;

  return {
    connect: (input) =>
      commandBus.execute(ConnectToTargetToken, {
        portName: input.portName,
        manufacturer: TargetManufacturer.fromValue(input.manufacturer),
        baudRate: input.baudRate,
        deviceId: input.deviceId,
      }),

    disconnect: async (input) => {
      await commandBus.execute(DisconnectFromTargetToken, {
        connectionId: input.connectionId,
      });
    },

    listPorts: async () => {
      const ports = await usbManager.listPorts();

      return {
        ports: ports.map((port) => ({
          path: port.path,
          manufacturer: port.manufacturer,
          serialNumber: port.serialNumber,
          vendorId: port.vendorId,
          productId: port.productId,
        })),
      };
    },

    getDevicesByManufacturer: async (input) => {
      const manufacturer = TargetManufacturer.fromValue(input.manufacturer);
      const devices = TargetDevice.getByManufacturer(manufacturer).filter(
        (device) => targetConnectionSupport.unavailableReason(manufacturer.value, device.id) === null,
      );

      return {
        devices: devices.map((device) => ({
          id: device.id,
          manufacturer: device.manufacturer.value as 'SIUS' | 'MEYTON' | 'DISAG' | 'CUSTOM' | 'KOHTO',
          displayName: device.displayName,
          baudRate: device.baudRate,
          supportedDisciplines: device.supportedDisciplines.map((d) => d.value),
        })),
      };
    },
  };
}
