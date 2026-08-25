import { Aedes } from 'aedes';
import { createServer, type Server } from 'node:net';
import { Logger } from '@/shared/utils/Logger';

import type { MqttRetainedMessageStore } from './SqliteMqttRetainedMessageStore';

const logger = Logger.create('EmbeddedMqttBroker');

export interface BrokerConfig {
  port: number;
  maxConnections?: number;
}

export class EmbeddedMqttBroker {
  private aedes: Aedes | null = null;
  private server: Server | null = null;
  private _running = false;
  private config: BrokerConfig;

  constructor(
    config: BrokerConfig,
    private readonly retainedMessageStore?: MqttRetainedMessageStore,
  ) {
    this.config = config;
  }

  get running(): boolean {
    return this._running;
  }

  get port(): number {
    const address = this.server?.address();
    if (address && typeof address === 'object') return address.port;
    return this.config.port;
  }

  async start(): Promise<void> {
    if (this._running) return;

    try {
      this.aedes = await Aedes.createBroker({
        authorizePublish: (_client, packet, callback) => {
          try {
            this.retainedMessageStore?.apply({
              topic: packet.topic,
              payload: Buffer.from(packet.payload),
              qos: packet.qos,
              retain: packet.retain,
            });
            callback(null);
          } catch (error) {
            callback(error instanceof Error ? error : new Error(String(error)));
          }
        },
      });
      await this.restoreRetainedMessages(this.aedes);

      this.server = createServer(this.aedes.handle);
      this.server.maxConnections = this.config.maxConnections ?? 100;

      await new Promise<void>((resolve, reject) => {
        const onStartupError = (err: Error): void => {
          reject(err);
        };

        this.server!.once('error', onStartupError);

        this.server!.listen(this.config.port, () => {
          this.server!.removeListener('error', onStartupError);

          // Persistent error handler to prevent unhandled 'error' events
          // from crashing the process after successful startup
          this.server!.on('error', (err: Error) => {
            logger.logError('Embedded MQTT broker runtime error', err);
          });

          this._running = true;
          logger.info(`Embedded MQTT broker started on port ${this.port}`);
          resolve();
        });
      });
    } catch (error) {
      logger.logError(
        'Failed to start embedded MQTT broker',
        error instanceof Error ? error : new Error(String(error)),
      );
      await this.cleanup();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.server && !this.aedes) return;

    await this.cleanup();
    logger.info('Embedded MQTT broker stopped');
  }

  private async cleanup(): Promise<void> {
    const server = this.server;
    const aedes = this.aedes;
    this._running = false;
    this.server = null;
    this.aedes = null;

    await Promise.all([
      new Promise<void>((resolve) => {
        if (!server || !server.listening) return resolve();
        server.close((serverErr) => {
          if (serverErr) logger.logError('Error closing TCP server', serverErr);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        if (!aedes) return resolve();
        aedes.close(resolve);
      }),
    ]);
  }

  private async restoreRetainedMessages(aedes: Aedes): Promise<void> {
    const retainedMessages = this.retainedMessageStore?.loadAll() ?? [];
    for (const message of retainedMessages) {
      await new Promise<void>((resolve, reject) => {
        aedes.publish(
          {
            cmd: 'publish',
            topic: message.topic,
            payload: message.payload,
            qos: message.qos,
            retain: true,
            dup: false,
          },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    }
  }
}
