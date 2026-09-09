// SPDX-License-Identifier: MIT
import { directorSubscriptions } from '@/shared/mqtt';

import type { IMqttTransport, MqttMessageHandler } from '../domain/IMqttTransport';

import type { DirectorMqttOptions } from './DirectorMqttTypes';

interface DirectorMqttConnectionCallbacks {
  onMessage: MqttMessageHandler;
  onSessionReset: () => void;
  onDisconnecting: () => void;
  onReady: () => void;
  onStateChanged: () => void;
  onError: (error: unknown) => void;
  onDebugLog: (message: string) => void;
}

/** Owns broker readiness, subscription recovery and transport listener lifetime. */
export class DirectorMqttConnection {
  private connected = false;
  private currentBrokerUrl: string | null = null;
  private unsubscribeTransportEvents: Array<() => void> = [];
  private resubscribeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private transportConnectionEpoch = 0;

  constructor(
    private readonly transport: IMqttTransport,
    private readonly options: Pick<DirectorMqttOptions, 'directorId' | 'credentials' | 'resubscribeRetryMs'>,
    private readonly callbacks: DirectorMqttConnectionCallbacks,
  ) {}

  get ready(): boolean {
    return this.connected;
  }

  get brokerUrl(): string | null {
    return this.currentBrokerUrl;
  }

  isConnected(): boolean {
    return this.connected && this.transport.isConnected();
  }

  assertConnected(): void {
    if (!this.isConnected()) throw new Error('MQTT client is not connected');
  }

  async connect(brokerUrl: string): Promise<void> {
    if (this.connected && this.transport.isConnected() && this.currentBrokerUrl === brokerUrl) return;
    if (this.transport.isConnected()) await this.disconnect();

    this.callbacks.onSessionReset();
    this.currentBrokerUrl = brokerUrl;
    try {
      await this.transport.connect(
        brokerUrl,
        `${this.options.directorId}-${crypto.randomUUID()}`,
        this.options.credentials,
      );
      this.bindTransportEvents();
      await this.subscribeAsDirector();
      this.connected = true;
      this.callbacks.onReady();
      this.callbacks.onDebugLog(`Connected to ${sanitizeBrokerUrl(brokerUrl)}`);
      this.callbacks.onStateChanged();
    } catch (error) {
      this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
      await this.transport.disconnect().catch(() => undefined);
      this.connected = false;
      this.currentBrokerUrl = null;
      this.callbacks.onSessionReset();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.transportConnectionEpoch += 1;
    this.clearResubscribeRetryTimer();
    this.callbacks.onDisconnecting();
    this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
    try {
      await this.transport.disconnect();
      this.callbacks.onDebugLog('Disconnected from MQTT broker');
    } finally {
      // A failed graceful close still invalidates this service session. Keep
      // readiness in sync so a later connect to the same broker is not skipped.
      this.connected = false;
      this.callbacks.onStateChanged();
    }
  }

  private bindTransportEvents(): void {
    this.unsubscribeTransportEvents.splice(0).forEach((unsubscribe) => unsubscribe());
    this.unsubscribeTransportEvents.push(
      this.transport.onMessage((topic, payload) => this.callbacks.onMessage(topic, payload)),
      this.transport.onConnected(() => {
        const connectionEpoch = ++this.transportConnectionEpoch;
        this.clearResubscribeRetryTimer();
        this.connected = false;
        this.callbacks.onSessionReset();
        this.callbacks.onStateChanged();
        void this.restoreSubscriptionsAfterReconnect(connectionEpoch);
      }),
      this.transport.onDisconnected(() => {
        this.transportConnectionEpoch += 1;
        this.clearResubscribeRetryTimer();
        this.connected = false;
        this.callbacks.onStateChanged();
      }),
      this.transport.onError((error) => this.callbacks.onError(error)),
    );
  }

  private async restoreSubscriptionsAfterReconnect(connectionEpoch: number, reportError = true): Promise<void> {
    try {
      await this.subscribeAsDirector();
      if (connectionEpoch !== this.transportConnectionEpoch || !this.transport.isConnected()) return;
      this.connected = true;
      this.callbacks.onReady();
      this.callbacks.onDebugLog('MQTT subscriptions restored after reconnect');
      this.callbacks.onStateChanged();
    } catch (error) {
      if (connectionEpoch !== this.transportConnectionEpoch) return;
      this.connected = false;
      this.callbacks.onStateChanged();
      if (reportError) this.callbacks.onError(error);
      this.clearResubscribeRetryTimer();
      this.resubscribeRetryTimer = setTimeout(() => {
        this.resubscribeRetryTimer = null;
        if (connectionEpoch !== this.transportConnectionEpoch || !this.transport.isConnected()) return;
        void this.restoreSubscriptionsAfterReconnect(connectionEpoch, false);
      }, this.options.resubscribeRetryMs ?? 1_000);
    }
  }

  private async subscribeAsDirector(): Promise<void> {
    for (const topic of directorSubscriptions) {
      await this.transport.subscribe(topic, 1);
    }
  }

  private clearResubscribeRetryTimer(): void {
    if (this.resubscribeRetryTimer) {
      clearTimeout(this.resubscribeRetryTimer);
      this.resubscribeRetryTimer = null;
    }
  }
}

export function sanitizeBrokerUrl(brokerUrl: string): string {
  return brokerUrl.replace(/^(mqtts?:\/\/)[^@/]+@/, '$1***@');
}
