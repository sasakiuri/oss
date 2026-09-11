// SPDX-License-Identifier: MIT
import type { DisconnectFromTargetInput } from '@/main/composition/tokens';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export function createDisconnectFromTargetHandler(
  connectionRepository: IConnectionRepository,
  usbManager: IUSBConnectionManager,
  eventBus: IEventBus,
): CommandHandler<DisconnectFromTargetInput> {
  return async (input) => {
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection) {
      throw ErrorCatalog.createError('CONNECTION_NOT_FOUND');
    }

    await usbManager.disconnect();

    const disconnectedConnection = connection.disconnect();

    await connectionRepository.save(disconnectedConnection);

    eventBus.emit({
      type: 'ConnectionLost',
      timestamp: Date.now(),
      aggregateId: disconnectedConnection.id,
      reason: 'User requested disconnection',
    });
  };
}
