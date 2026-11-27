// SPDX-License-Identifier: MIT
/** Publishes connection changes and a hardware heartbeat every 60 seconds. */

import type { ShotTimingSettings } from '@sasakiuri/saika-protocol/ShotTimingSettings';
import type { TimingEvidenceReport } from '@sasakiuri/saika-protocol/TimingEvidenceReport';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';
import type { RulePackIdentity } from '@sasakiuri/saika-rules';

import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import { readMirroredLaneId } from '@/main/modules/settings/application/MirroredLaneId';
import type { ConnectionEstablishedEvent, ConnectionLostEvent } from '@/main/shared-infra/events/coreEvents';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

interface HardwareState {
  status: 'connected' | 'disconnected' | 'offline';
  manufacturer?: string;
  deviceId?: string | null;
  portPath?: string;
  connectionId?: string;
}

export interface LaneTargetIntegrationCapabilities {
  readonly schemaVersion: 1;
  readonly timedTarget: {
    readonly actuation: 'INTEGRATED' | 'NOT_INTEGRATED';
    readonly feedback: 'INTEGRATED' | 'NOT_INTEGRATED';
  };
}

export interface LaneRuntimeCapabilities {
  readonly competitionProtocolVersions: readonly [1];
  readonly rulePacks: readonly RulePackIdentity[];
  readonly timingEvidence?: TimingEvidenceReport;
  readonly targetIntegration?: LaneTargetIntegrationCapabilities;
  readonly timedTargetPolicy?: {
    readonly enforcementMode: 'DISABLED' | 'ADVISORY' | 'REQUIRED';
    readonly shotTiming?: ShotTimingSettings;
  };
}

export class HardwareStatePublisher {
  private readonly mqttClient: IMqttClientService;
  private readonly storage: ILocalStorage;
  private readonly appVersion: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentState: HardwareState = { status: 'disconnected' };
  private publishingEnabled = true;
  private runtimeLaneAlias: string | null = null;

  constructor(
    mqttClient: IMqttClientService,
    eventBus: IEventBus,
    storage: ILocalStorage,
    appVersion: string,
    private readonly capabilities?: LaneRuntimeCapabilities | (() => LaneRuntimeCapabilities),
  ) {
    this.mqttClient = mqttClient;
    this.storage = storage;
    this.appVersion = appVersion;

    eventBus.on('ConnectionEstablished', (event: ConnectionEstablishedEvent) => {
      this.currentState = {
        status: 'connected',
        manufacturer: event.manufacturer.value,
        deviceId: event.deviceId,
        portPath: event.portPath,
        connectionId: event.aggregateId,
      };
      this.publishState();
    });

    eventBus.on('ConnectionLost', (_event: ConnectionLostEvent) => {
      this.currentState = { status: 'disconnected' };
      this.publishState();
    });
  }

  /** The retained hardware topic, or null until settings give this Lane its ID. */
  private getTopic(): string | null {
    const laneId = this.getLaneId();
    return laneId ? mqttTopics.laneHardwareState(laneId) : null;
  }

  private getLaneId(): string {
    return readMirroredLaneId(this.storage);
  }

  private getLaneAlias(): string {
    if (this.runtimeLaneAlias !== null) return this.runtimeLaneAlias;
    const settings = this.storage.get<{ laneAlias?: string }>('mqtt.settings');
    return settings?.laneAlias ?? '';
  }

  setRuntimeLaneAlias(laneAlias: string | null): void {
    this.runtimeLaneAlias = laneAlias;
  }

  private buildPayload(connection: HardwareState = this.currentState): string {
    const capabilities = typeof this.capabilities === 'function' ? this.capabilities() : this.capabilities;
    return JSON.stringify({
      laneId: this.getLaneId(),
      laneAlias: this.getLaneAlias(),
      connection,
      appVersion: this.appVersion,
      ...(capabilities ? { capabilities } : {}),
      publishedAt: new Date().toISOString(),
    });
  }

  /** Publishes the current state; without a Lane ID it waits for the next change or heartbeat after the ID is set. */
  publishState(): void {
    const topic = this.getTopic();
    if (!this.publishingEnabled || topic === null || !this.mqttClient.isConnected()) {
      return;
    }

    const payload = this.buildPayload();

    this.mqttClient.publish(topic, payload, { qos: 1, retain: true }).catch((err: unknown) => {
      const logger = getLogger();
      logger.error('[HardwareStatePublisher] Failed to publish state', 'mqtt', {
        error: errorMessage(err),
      });
    });
  }

  async publishOfflineState(): Promise<void> {
    this.publishingEnabled = false;
    const topic = this.getTopic();
    if (topic === null || !this.mqttClient.isConnected()) return;

    try {
      await this.mqttClient.publish(topic, this.buildPayload({ status: 'offline' }), {
        qos: 1,
        retain: true,
      });
    } catch (error) {
      this.publishingEnabled = true;
      throw error;
    }
  }

  resumePublishing(): void {
    this.publishingEnabled = true;
  }

  startHeartbeat(intervalMs: number = 60_000): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.publishState();
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** The topic for the broker's offline will, or null while this Lane has no ID to leave one under. */
  getWillTopic(): string | null {
    return this.getTopic();
  }

  getWillPayload(): string {
    return this.buildPayload({ status: 'offline' });
  }
}
