// SPDX-License-Identifier: MIT
import type { ConnectToTargetInput } from '@/main/composition/tokens';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

export function createConnectToTargetHandler(
  connectionRepository: IConnectionRepository,
  usbManager: IUSBConnectionManager,
  eventBus: IEventBus,
  getCurrentMode: () => Mode,
): CommandHandler<ConnectToTargetInput> {
  return async (input) => {
    const connection = await usbManager.connect({
      portName: input.portName,
      manufacturer: input.manufacturer,
      baudRate: input.baudRate,
      deviceId: input.deviceId,
    });

    // Synchronize the target with the mode that is current after the potentially
    // asynchronous port/protocol initialization completes.
    await usbManager.sendMode(getCurrentMode());

    await connectionRepository.save(connection);

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
