import { MessageChannel, type MessagePort } from 'node:worker_threads';

import { expose } from 'comlink';
import { vi } from 'vitest';

/** Exercise Comlink serialization over real message ports, with controllable Worker lifecycle events. */
export class TestWorker extends EventTarget {
  private readonly channel = new MessageChannel();
  postMessage = vi.fn((...args: Parameters<MessagePort['postMessage']>) => this.channel.port1.postMessage(...args));
  terminate = vi.fn(() => {
    this.channel.port1.close();
    this.channel.port2.close();
  });

  constructor(api: unknown) {
    super();
    this.channel.port1.addEventListener('message', (event) => {
      this.dispatchEvent(new MessageEvent('message', { data: event.data }));
    });
    this.channel.port1.start();
    expose(api, this.channel.port2);
  }
}
