// SPDX-License-Identifier: MIT
import type { IMqttTransport, MqttMessageHandler } from '@/main/modules/mqtt/domain/IMqttTransport';

export class FakeMqttTransport implements IMqttTransport {
  connected = false;
  connectCalls = 0;
  disconnectCalls = 0;
  disconnectError: Error | null = null;
  subscribeError: Error | null = null;
  subscribeBarrier: Promise<void> | null = null;
  publishBarrierForTopic: ((topic: string) => Promise<void> | null) | null = null;
  publishErrorForTopic: ((topic: string) => Error | null) | null = null;
  subscriptions: string[] = [];
  publications: Array<{
    topic: string;
    payload: string;
    options: { qos: 0 | 1 | 2; retain: boolean };
  }> = [];
  private messageHandlers = new Set<MqttMessageHandler>();
  private connectedHandlers = new Set<() => void>();
  private disconnectedHandlers = new Set<() => void>();
  private errorHandlers = new Set<(error: Error) => void>();

  async connect(): Promise<void> {
    this.connectCalls += 1;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.connected = false;
    this.disconnectedHandlers.forEach((handler) => handler());
    if (this.disconnectError) throw this.disconnectError;
  }

  async publish(topic: string, payload: string, options: { qos: 0 | 1 | 2; retain: boolean }): Promise<void> {
    await this.publishBarrierForTopic?.(topic);
    const error = this.publishErrorForTopic?.(topic);
    if (error) throw error;
    this.publications.push({ topic, payload, options });
  }

  async subscribe(topic: string): Promise<void> {
    await this.subscribeBarrier;
    if (this.subscribeError) throw this.subscribeError;
    this.subscriptions.push(topic);
  }

  onMessage(handler: MqttMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onConnected(handler: () => void): () => void {
    this.connectedHandlers.add(handler);
    return () => this.connectedHandlers.delete(handler);
  }

  onDisconnected(handler: () => void): () => void {
    this.disconnectedHandlers.add(handler);
    return () => this.disconnectedHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  emitMessage(topic: string, payload: unknown): void {
    const buffer = Buffer.from(JSON.stringify(payload));
    this.messageHandlers.forEach((handler) => handler(topic, buffer));
  }

  emitRawMessage(topic: string, payload: Buffer): void {
    this.messageHandlers.forEach((handler) => handler(topic, payload));
  }

  emitConnected(): void {
    this.connected = true;
    this.connectedHandlers.forEach((handler) => handler());
  }

  emitDisconnected(): void {
    this.connected = false;
    this.disconnectedHandlers.forEach((handler) => handler());
  }
}
