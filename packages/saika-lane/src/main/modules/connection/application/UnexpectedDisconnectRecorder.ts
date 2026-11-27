// SPDX-License-Identifier: MIT
import type { Connection } from '@/main/modules/connection/domain/Connection';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';

/**
 * Holds the disconnected state of a target whose port closed unexpectedly.
 *
 * The state stays pending while the USB manager retries: an automatic
 * reconnect persists it together with the new connection, a failed retry or a
 * manual connect persists it and announces ConnectionLost, and a manual
 * disconnect discards it.
 */
export class UnexpectedDisconnectRecorder {
  private pending: Promise<Connection | null> | null = null;

  constructor(
    private readonly connectionRepository: IConnectionRepository,
    private readonly eventBus: IEventBus,
  ) {}

  /** Captures the active connection as disconnected when the port closes unexpectedly. */
  record(): void {
    this.pending = (async () => {
      try {
        const activeConnection = await this.connectionRepository.findActive();
        if (!activeConnection || activeConnection.isDisconnected) {
          return null;
        }

        return activeConnection.disconnect();
      } catch (err: unknown) {
        getLogger().warn('Failed to propagate unexpected USB disconnect', 'main', {
          err: errorMessage(err),
        });
        return null;
      }
    })();
  }

  /** Persists the pending state and the automatic reconnection; false when nothing was pending. */
  async completeReconnect(reconnectedConnection: Connection): Promise<boolean> {
    const disconnectedConnection = await this.take();
    if (!disconnectedConnection) {
      return false;
    }

    await this.connectionRepository.save(disconnectedConnection);
    await this.connectionRepository.save(reconnectedConnection);

    this.eventBus.emit({
      type: 'ConnectionEstablished',
      timestamp: Date.now(),
      aggregateId: reconnectedConnection.id,
      manufacturer: reconnectedConnection.manufacturer,
      portPath: reconnectedConnection.portPath,
      deviceId: reconnectedConnection.deviceId,
    });
    return true;
  }

  /** Finalizes the pending state before a manual connect; failures are logged. */
  async flushBeforeConnect(): Promise<void> {
    try {
      await this.finalize();
    } catch (err: unknown) {
      getLogger().warn('Failed to finalize pending unexpected USB disconnect before manual connect', 'main', {
        err: errorMessage(err),
      });
    }
  }

  /** Finalizes the pending state once automatic reconnection gave up; failures are logged. */
  async flushAfterReconnectFailure(): Promise<void> {
    try {
      await this.finalize();
    } catch (err: unknown) {
      getLogger().warn('Failed to finalize unexpected USB disconnect', 'main', {
        err: errorMessage(err),
      });
    }
  }

  /** Drops the pending state before a manual disconnect; failures are logged. */
  async discard(): Promise<void> {
    try {
      await this.take();
    } catch (err: unknown) {
      getLogger().warn('Failed to discard pending unexpected USB disconnect before manual disconnect', 'main', {
        err: errorMessage(err),
      });
    }
  }

  private async take(): Promise<Connection | null> {
    const pending = this.pending;
    this.pending = null;
    return pending ? await pending : null;
  }

  private async finalize(): Promise<void> {
    const disconnectedConnection = await this.take();
    if (!disconnectedConnection) {
      return;
    }

    await this.connectionRepository.save(disconnectedConnection);
    this.eventBus.emit({
      type: 'ConnectionLost',
      timestamp: Date.now(),
      aggregateId: disconnectedConnection.id,
      reason: 'USB device disconnected unexpectedly',
    });
  }
}
