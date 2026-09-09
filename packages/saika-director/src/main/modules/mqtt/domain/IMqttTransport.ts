// SPDX-License-Identifier: MIT
export type MqttMessageHandler = (topic: string, payload: Buffer) => void;

export interface MqttCredentials {
  readonly username: string;
  readonly password: string;
}

export interface IMqttTransport {
  connect(brokerUrl: string, clientId: string, credentials?: MqttCredentials): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, payload: string, options: { qos: 0 | 1 | 2; retain: boolean }): Promise<void>;
  subscribe(topic: string, qos: 0 | 1 | 2): Promise<void>;
  onMessage(handler: MqttMessageHandler): () => void;
  onConnected(handler: () => void): () => void;
  onDisconnected(handler: () => void): () => void;
  onError(handler: (error: Error) => void): () => void;
  isConnected(): boolean;
}
