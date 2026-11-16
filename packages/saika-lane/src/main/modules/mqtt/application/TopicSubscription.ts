// SPDX-License-Identifier: MIT
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';

type MessageListener = Parameters<IMqttClientService['onMessage']>[0];

export interface TopicSubscriptionPolicy {
  /** Register the listener before SUBSCRIBE so a retained message delivered during SUBSCRIBE is not missed. */
  readonly listenBeforeSubscribe: boolean;
  /** Whether an UNSUBSCRIBE failure propagates while the client is still connected, or is always ignored. */
  readonly unsubscribeErrors: 'rethrow-while-connected' | 'ignore';
}

/** One QoS 1 subscription and its message listener, opened and closed together. */
export class TopicSubscription {
  private topic: string | null = null;
  private removeListener: (() => void) | null = null;

  constructor(
    private readonly mqttClient: Pick<IMqttClientService, 'subscribe' | 'unsubscribe' | 'onMessage' | 'isConnected'>,
    private readonly policy: TopicSubscriptionPolicy,
  ) {}

  /**
   * Records the topic, then subscribes and registers the listener in the policy's order. A failed SUBSCRIBE keeps
   * the topic recorded so the next `close()` still unsubscribes it.
   */
  async open(topic: string, listener: MessageListener): Promise<void> {
    this.topic = topic;
    if (this.policy.listenBeforeSubscribe) this.removeListener = this.mqttClient.onMessage(listener);
    await this.mqttClient.subscribe(topic, 1);
    if (!this.policy.listenBeforeSubscribe) this.removeListener = this.mqttClient.onMessage(listener);
  }

  /** Removes the listener, then unsubscribes; the topic stays recorded when a propagated UNSUBSCRIBE fails. */
  async close(): Promise<void> {
    this.removeListener?.();
    this.removeListener = null;
    if (!this.topic) return;
    try {
      await this.mqttClient.unsubscribe(this.topic);
    } catch (error) {
      if (this.policy.unsubscribeErrors === 'rethrow-while-connected' && this.mqttClient.isConnected()) throw error;
      // Ignore when already disconnected.
    }
    this.topic = null;
  }
}
