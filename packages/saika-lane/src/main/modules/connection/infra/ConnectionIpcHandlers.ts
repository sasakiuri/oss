// SPDX-License-Identifier: MIT
/**
 * ConnectionIpcHandlers
 *
 * IPC handler factory for the Connection contract.
 * Creates handlers for connect, disconnect, list ports, and list devices.
 */

import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { TargetDevice } from '@/main/modules/target/domain/TargetDevice';
import { DISAG_RED_DOT_RIFLE_DEVICE_ID } from '@/main/modules/target/domain/targetDeviceDefinitions';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { connectionContract } from '@/shared/ipc/contracts';
import type { InferHandlers } from '@/shared/ipc/defineContract';

export interface ConnectionIpcHandlersDeps {
  commandBus: CommandBus;
  eventBus: IEventBus;
  usbManager: IUSBConnectionManager;
}

export function createConnectionIpcHandlers(deps: ConnectionIpcHandlersDeps): InferHandlers<typeof connectionContract> {
  const { commandBus, eventBus, usbManager } = deps;

  return {
    connect: async (input) => {
      const manufacturer = TargetManufacturer.fromValue(input.manufacturer);

      let unsubscribe: (() => void) | undefined;
      let timeoutId: NodeJS.Timeout | null = null;
      let rejectEvent: ((reason: unknown) => void) | undefined;

      try {
        // Prepare to capture connectionId from ConnectionEstablished event
        const eventPromise = new Promise<string>((resolve, reject) => {
          rejectEvent = reject;
          unsubscribe = eventBus.on('ConnectionEstablished', (event) => {
            if (event.portPath !== input.portName) {
              return;
            }

            if (event.manufacturer.value !== input.manufacturer) {
              return;
            }

            if (input.deviceId !== undefined && (event.deviceId ?? null) !== input.deviceId) {
              return;
            }

            resolve(event.aggregateId);
          });
        });

        // Prevent unhandled rejection if eventPromise loses the race
        eventPromise.catch(() => {});

        // Create timeout promise (10 seconds)
        const timeoutPromise = new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(ErrorCatalog.createError('CONNECTION_TIMEOUT', { timeoutMs: 10000 }));
          }, 10000);
        });

        // Prevent unhandled rejection when timeout loses the race
        timeoutPromise.catch(() => {});

        // Execute command via token-based dispatch (returns void)
        await commandBus.execute(ConnectToTargetToken, {
          portName: input.portName,
          manufacturer,
          baudRate: input.baudRate,
          deviceId: input.deviceId,
        });

        // Wait for event to capture connectionId with timeout
        const connectionId = await Promise.race([eventPromise, timeoutPromise]);

        return { connectionId };
      } finally {
        // Reject the event promise to prevent it from pending indefinitely
        rejectEvent?.(new Error('cleanup'));
        // Ensure event listener is always cleaned up
        unsubscribe?.();
        // Ensure timeout is always cleared
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    },

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
        (device) => manufacturer.value !== 'DISAG' || device.id === DISAG_RED_DOT_RIFLE_DEVICE_ID,
      );

      return {
        devices: devices.map((device) => ({
          id: device.id,
          manufacturer: device.manufacturer.value as 'SIUS' | 'MEYTON' | 'DISAG' | 'CUSTOM' | 'KOHTO',
          displayName: device.displayName,
          baudRate: device.baudRate,
          supportedDisciplines: device.supportedDisciplines.map((d) => d.value) as (
            | 'AIR_RIFLE_10M'
            | 'AIR_PISTOL_10M'
            | 'RIFLE_50M'
            | 'PISTOL_25M'
            | 'BEAM_RIFLE_10M'
          )[],
        })),
      };
    },
  };
}
