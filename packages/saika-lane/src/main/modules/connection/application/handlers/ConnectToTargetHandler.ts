// SPDX-License-Identifier: MIT
import type { ConnectToTargetInput } from '@/main/composition/tokens';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/**
 * createConnectToTargetHandler
 *
 * @description
 * Handler factory that processes the target connection command.
 * Connects using the USB connection manager, creates a Connection entity,
 * saves it, and emits the ConnectionEstablished event.
 *
 * @example
 * ```typescript
 * const handler = createConnectToTargetHandler(connectionRepository, usbManager, eventBus);
 * await handler({ portName: 'COM3', manufacturer: TargetManufacturer.sius(), baudRate: 9600 });
 * ```
 *
 * @param connectionRepository - Connection repository
 * @param usbManager - USB connection manager
 * @param eventBus - Event bus
 * @returns CommandHandler<ConnectToTargetInput> - Command handler function
 */
export function createConnectToTargetHandler(
  connectionRepository: IConnectionRepository,
  usbManager: IUSBConnectionManager,
  eventBus: IEventBus,
): CommandHandler<ConnectToTargetInput> {
  return async (input) => {
    // Connect using the USB connection manager
    const connection = await usbManager.connect({
      portName: input.portName,
      manufacturer: input.manufacturer,
      baudRate: input.baudRate,
      deviceId: input.deviceId,
    });

    // Send sighting mode byte 'S' immediately after connection (best-effort: continue even on failure)
    await usbManager.sendMode(Mode.sighting());

    // Persist the connection
    await connectionRepository.save(connection);

    // Emit the ConnectionEstablished event
    eventBus.emit({
      type: 'ConnectionEstablished',
      timestamp: Date.now(),
      aggregateId: connection.id,
      manufacturer: connection.manufacturer,
      portPath: connection.portPath,
      deviceId: connection.deviceId,
    });
  };
}
