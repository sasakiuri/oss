import type { EventBus, EventName, EventHandler } from './EventBus';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('ElectronEventBus');

/** Subscribes through the preload bridge; each returned unsubscribe releases its listener once. */
export class ElectronEventBus implements EventBus {
  private nextId = 0;

  subscribe<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const subscriptionKey = `${event}:${this.nextId++}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ipcUnsubscribe = window.electronAPI.on[event](handler as any);

    logger.debug(`Subscribed to "${event}" (key=${subscriptionKey})`);

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;

      ipcUnsubscribe();
      logger.debug(`Unsubscribed from "${event}" (key=${subscriptionKey})`);
    };
  }
}
