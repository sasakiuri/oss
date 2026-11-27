// SPDX-License-Identifier: MIT
export interface MqttConnectOptions {
  brokerUrl: string;
  clientId: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface MqttPublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
}

export interface IMqttClientService {
  connect(options: MqttConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  publish(topic: string, payload: string, options?: MqttPublishOptions): Promise<void>;
  subscribe(topic: string, qos?: 0 | 1 | 2): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  setWill(topic: string, payload: string, qos?: 0 | 1 | 2, retain?: boolean): void;
  /** Forgets the will set for earlier connections, so the next connection leaves none. */
  clearWill(): void;
  onMessage(handler: (topic: string, payload: Buffer) => void): () => void;
  onConnect(handler: () => void): () => void;
  onDisconnect(handler: () => void): () => void;
  isConnected(): boolean;
}
