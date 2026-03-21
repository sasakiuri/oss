// SPDX-License-Identifier: MIT
import type { DisconnectFromTargetInput } from '@/main/composition/tokens';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { CommandHandler } from '@/main/shared-infra/cqrs';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/**
 * createDisconnectFromTargetHandler
 *
 * @description
 * Handler factory that processes the target disconnect command.
 * Retrieves the connection, disconnects via the USB connection manager, saves it, and emits the ConnectionLost event.
 *
 * @example
 * ```typescript
 * const handler = createDisconnectFromTargetHandler(connectionRepository, usbManager, eventBus);
 * await handler({ connectionId });
 * ```
 *
 * @param connectionRepository - Connection repository
 * @param usbManager - USB connection manager
 * @param eventBus - Event bus
 * @returns CommandHandler<DisconnectFromTargetInput> - Command handler function
 */
export function createDisconnectFromTargetHandler(
  connectionRepository: IConnectionRepository,
  usbManager: IUSBConnectionManager,
  eventBus: IEventBus,
): CommandHandler<DisconnectFromTargetInput> {
  return async (input) => {
    // Retrieve the connection
    const connection = await connectionRepository.findById(input.connectionId);
    if (!connection) {
      throw ErrorCatalog.createError('CONNECTION_NOT_FOUND');
    }

    // Disconnect via the USB connection manager
    await usbManager.disconnect();

    // Update the connection to disconnected state
    const disconnectedConnection = connection.disconnect();

    // Persist the connection
    await connectionRepository.save(disconnectedConnection);

    // Emit the ConnectionLost event
    eventBus.emit({
      type: 'ConnectionLost',
      timestamp: Date.now(),
      aggregateId: disconnectedConnection.id,
      reason: 'User requested disconnection',
    });
  };
}
