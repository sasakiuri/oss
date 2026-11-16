// SPDX-License-Identifier: MIT
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { sanitizeBrokerUrl } from '@/main/modules/mqtt/domain/sanitizeBrokerUrl';
import type { IAppSettingsStore } from '@/main/modules/settings/application/IAppSettingsStore';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { ConnectMqttInput } from '@/shared/ipc/contracts';
import type { MqttSettings, MqttStatus } from '@/shared/ipc/contracts/mqtt.contract';

import type { LaneTier1CommandHandler } from './commands/LaneTier1CommandHandler';
import type { HardwareStatePublisher } from './HardwareStatePublisher';
import type { RetainPublisher } from './RetainPublisher';

interface RetainedStatePublisher {
  publishCurrentState(): Promise<void>;
}

export interface MqttConnectionControllerDeps {
  mqttClient: IMqttClientService;
  settingsStore: Pick<IAppSettingsStore, 'getLaneId' | 'getMqttSettings' | 'saveMqttSettings'>;
  eventBus: IEventBus;
  isReady: () => boolean;
  credentials: { username: string; password: string } | undefined;
  hardwarePublisher: Pick<
    HardwareStatePublisher,
    | 'getWillPayload'
    | 'getWillTopic'
    | 'publishOfflineState'
    | 'publishState'
    | 'resumePublishing'
    | 'setRuntimeLaneAlias'
    | 'startHeartbeat'
    | 'stopHeartbeat'
  >;
  /** Lane-owned safety state, published even before startup is READY. */
  safetyStatePublisher: RetainedStatePublisher;
  /** Retained states published in this order on connect once startup is READY. */
  readyStatePublishers: readonly RetainedStatePublisher[];
  tier1Handler: Pick<LaneTier1CommandHandler, 'subscribe' | 'unsubscribe'>;
  retainPublisher: Pick<RetainPublisher, 'registerCallbacks' | 'republish'>;
}

/** Owns the broker connection: connect, READY reconciliation, disconnect and the last connection error. */
export class MqttConnectionController {
  private lastConnectError: string | null = null;
  private inFlightConnect: { key: string; promise: Promise<void> } | null = null;

  constructor(private readonly deps: MqttConnectionControllerDeps) {}

  /** Joins an identical in-flight connection and queues a different one behind it. */
  connect(input: ConnectMqttInput): Promise<void> {
    const normalized = {
      brokerUrl: input.brokerUrl,
      laneAlias: input.laneAlias ?? this.deps.settingsStore.getMqttSettings().laneAlias,
      autoConnect: input.autoConnect ?? false,
    };
    const key = JSON.stringify(normalized);
    if (this.inFlightConnect) {
      if (this.inFlightConnect.key === key) return this.inFlightConnect.promise;
      return this.inFlightConnect.promise.catch(() => undefined).then(() => this.connect(normalized));
    }
    const promise = this.connectNow(normalized).finally(() => {
      this.inFlightConnect = null;
    });
    this.inFlightConnect = { key, promise };
    return promise;
  }

  /** On READY, republishes over an open connection or starts the saved automatic connection. */
  async afterReady(): Promise<void> {
    const { mqttClient, settingsStore, retainPublisher } = this.deps;
    const settings = settingsStore.getMqttSettings();
    if (mqttClient.isConnected()) {
      try {
        await retainPublisher.republish();
        this.lastConnectError = null;
        this.emitConnected(settingsStore.getLaneId(), settings.brokerUrl);
      } catch (error) {
        this.lastConnectError = error instanceof Error ? error.message : String(error);
        this.emitConnected(settingsStore.getLaneId(), settings.brokerUrl, this.lastConnectError);
        throw error;
      }
    } else if (settings.enabled && settings.autoConnect) await this.connect(settings);
  }

  async disconnect(): Promise<void> {
    const { hardwarePublisher, tier1Handler, mqttClient, eventBus } = this.deps;
    this.lastConnectError = null;
    hardwarePublisher.stopHeartbeat();
    // A graceful MQTT DISCONNECT does not trigger the broker Will. Publish
    // the same retained offline state explicitly before closing the socket.
    await hardwarePublisher.publishOfflineState();
    await tier1Handler.unsubscribe();
    await mqttClient.disconnect();

    // Emit MqttDisconnected event for ContractEventForwarder
    eventBus.emit({
      type: 'MqttDisconnected',
      timestamp: Date.now(),
      aggregateId: '',
    });
  }

  status(): MqttStatus {
    const currentLaneId = this.deps.settingsStore.getLaneId();
    const settings = this.deps.settingsStore.getMqttSettings();

    return {
      status: this.deps.mqttClient.isConnected() ? 'connected' : 'disconnected',
      brokerUrl: settings?.brokerUrl,
      laneId: currentLaneId,
      ...(this.lastConnectError ? { error: this.lastConnectError } : {}),
    };
  }

  private async connectNow(input: { brokerUrl: string; laneAlias?: string; autoConnect: boolean }): Promise<void> {
    const { mqttClient, settingsStore, hardwarePublisher, tier1Handler, retainPublisher, eventBus } = this.deps;
    const logger = getLogger();
    const currentLaneId = settingsStore.getLaneId();
    const savedSettings = settingsStore.getMqttSettings();
    const laneAlias = input.laneAlias ?? savedSettings?.laneAlias ?? '';

    try {
      if (mqttClient.isConnected()) {
        hardwarePublisher.stopHeartbeat();
        await hardwarePublisher.publishOfflineState();
        await tier1Handler.unsubscribe();
        await mqttClient.disconnect();
      }

      // Set Will message on MqttClientService before connecting
      hardwarePublisher.setRuntimeLaneAlias(laneAlias);
      mqttClient.setWill(hardwarePublisher.getWillTopic(), hardwarePublisher.getWillPayload(), 1, true);

      await mqttClient.connect({
        brokerUrl: input.brokerUrl,
        clientId: `saika-lane-${currentLaneId}`,
        ...(this.deps.credentials ? { credentials: this.deps.credentials } : {}),
      });

      // Register reconnect callbacks (must be after connect so onConnect/onDisconnect work)
      retainPublisher.registerCallbacks(true);

      // Publish initial state; the retained republish below publishes it again.
      hardwarePublisher.resumePublishing();
      hardwarePublisher.publishState();
      await this.deps.safetyStatePublisher.publishCurrentState();
      if (this.deps.isReady()) {
        for (const publisher of this.deps.readyStatePublishers) await publisher.publishCurrentState();
      }
      hardwarePublisher.startHeartbeat();

      // Subscribe to Tier1 commands
      await tier1Handler.subscribe();

      // Save settings if autoConnect requested
      if (input.autoConnect) {
        const settings: MqttSettings = {
          enabled: true,
          brokerUrl: input.brokerUrl,
          laneAlias,
          autoConnect: true,
          laneId: currentLaneId,
        };
        settingsStore.saveMqttSettings(settings);
        hardwarePublisher.setRuntimeLaneAlias(null);
      }

      await retainPublisher.republish();
      this.lastConnectError = null;
      // Emit MqttConnected event for ContractEventForwarder
      this.emitConnected(currentLaneId, input.brokerUrl);

      logger.info(`[MQTT Module] Connected to ${sanitizeBrokerUrl(input.brokerUrl)}`, 'mqtt');
    } catch (error) {
      this.lastConnectError = error instanceof Error ? error.message : String(error);
      hardwarePublisher.stopHeartbeat();
      await hardwarePublisher.publishOfflineState().catch(() => undefined);
      await tier1Handler.unsubscribe().catch(() => undefined);
      await mqttClient.disconnect().catch(() => undefined);
      eventBus.emit({
        type: 'MqttDisconnected',
        timestamp: Date.now(),
        aggregateId: '',
        reason: this.lastConnectError,
      });
      throw error;
    }
  }

  private emitConnected(laneId: string, brokerUrl: string, error?: string): void {
    this.deps.eventBus.emit({
      type: 'MqttConnected',
      timestamp: Date.now(),
      aggregateId: laneId,
      brokerUrl: sanitizeBrokerUrl(brokerUrl),
      laneId,
      ...(error !== undefined ? { error } : {}),
    });
  }
}
