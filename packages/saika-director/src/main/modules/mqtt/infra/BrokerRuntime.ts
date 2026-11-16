// SPDX-License-Identifier: MIT
import { networkInterfaces } from 'node:os';

import { Logger } from '@/shared/logging';

import type { EmbeddedMqttSecurityConfig } from '../domain/EmbeddedMqttAccessPolicy';
import { EmbeddedMqttBroker } from './EmbeddedMqttBroker';
import type { MqttRetainedMessageStore } from './SqliteMqttRetainedMessageStore';

// Operators read these lines under the module's historical log context.
const logger = Logger.create('mqtt.module');

export interface RuntimeBrokerConfig {
  mode: 'embedded' | 'external';
  url: string;
  port: number;
}

/** The Director MQTT client as the runtime needs it. */
export interface BrokerRuntimeClient {
  connect(brokerUrl: string): Promise<void>;
  disconnect(): Promise<void>;
  getSnapshot(): { readonly connected: boolean };
}

export interface BrokerRuntimeDependencies {
  readonly client: BrokerRuntimeClient;
  readonly readConfig: () => RuntimeBrokerConfig;
  readonly saveConfig: (config: RuntimeBrokerConfig) => void;
  readonly security: EmbeddedMqttSecurityConfig;
  readonly retainedMessageStore: MqttRetainedMessageStore;
}

/**
 * Owns the embedded broker and moves the Director client between embedded and external brokers.
 * Callers serialize these operations with the runtime transition lock.
 */
export class BrokerRuntime {
  private embeddedBroker: EmbeddedMqttBroker;

  constructor(private readonly deps: BrokerRuntimeDependencies) {
    this.embeddedBroker = this.createBroker(deps.readConfig().port);
  }

  readConfig(): RuntimeBrokerConfig {
    return this.deps.readConfig();
  }

  /** Switches to the requested broker and saves it; on failure restores the previous broker and rethrows. */
  async reconfigure(input: { mode: RuntimeBrokerConfig['mode']; url?: string; port?: number }) {
    const previous = this.deps.readConfig();
    const next: RuntimeBrokerConfig = {
      ...previous,
      mode: input.mode,
      ...(input.url === undefined ? {} : { url: input.url }),
      ...(input.port === undefined ? {} : { port: input.port }),
    };

    try {
      await this.transition(next);
      this.deps.saveConfig(next);
    } catch (error) {
      try {
        await this.transition(previous);
      } catch (rollbackError) {
        logger.logError('Failed to restore the previous MQTT broker configuration', rollbackError);
      }
      throw error;
    }

    logger.info('Broker config updated', { mode: next.mode });
    return { success: true };
  }

  status() {
    return {
      brokerRunning: this.embeddedBroker.running,
      clientConnected: this.deps.client.getSnapshot().connected,
      brokerPort: this.embeddedBroker.port,
      localAddresses: getLocalIpv4Addresses(),
    };
  }

  startBroker(): Promise<void> {
    return this.embeddedBroker.start();
  }

  /** Starts the embedded broker when the saved configuration uses it. */
  async startConfiguredBroker(): Promise<void> {
    if (this.deps.readConfig().mode === 'embedded') {
      await this.embeddedBroker.start();
    }
  }

  /** Disconnects a connected client first, then stops the embedded broker. */
  async stopBroker(): Promise<void> {
    if (this.deps.client.getSnapshot().connected) await this.deps.client.disconnect();
    await this.embeddedBroker.stop();
  }

  stopEmbeddedBroker(): Promise<void> {
    return this.embeddedBroker.stop();
  }

  /** Reconnects the client to the saved broker without changing the embedded broker. */
  async reconnect(): Promise<void> {
    const config = this.deps.readConfig();
    await this.deps.client.disconnect();
    await this.deps.client.connect(brokerUrl(config));
  }

  private async transition(config: RuntimeBrokerConfig): Promise<void> {
    await this.deps.client.disconnect();

    if (this.embeddedBroker.running && (config.mode === 'external' || this.embeddedBroker.port !== config.port)) {
      await this.embeddedBroker.stop();
    }
    if (!this.embeddedBroker.running && this.embeddedBroker.port !== config.port) {
      this.embeddedBroker = this.createBroker(config.port);
    }
    if (config.mode === 'embedded' && !this.embeddedBroker.running) {
      await this.embeddedBroker.start();
    }

    await this.deps.client.connect(brokerUrl(config));
  }

  private createBroker(port: number): EmbeddedMqttBroker {
    return new EmbeddedMqttBroker({ port, security: this.deps.security }, this.deps.retainedMessageStore);
  }
}

function brokerUrl(config: RuntimeBrokerConfig): string {
  return config.mode === 'embedded' ? `mqtt://localhost:${config.port}` : config.url;
}

function getLocalIpv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const nets of Object.values(networkInterfaces())) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}
