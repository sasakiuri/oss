// SPDX-License-Identifier: MIT
/**
 * MQTT Client Service Interface
 *
 * @description
 * Interface that abstracts communication with the MQTT broker.
 * Hides the details of the mqtt.js library and provides testability.
 */

export interface MqttConnectOptions {
  brokerUrl: string;
  clientId: string;
  keepalive?: number;
  reconnectPeriod?: number;
  will?: {
    topic: string;
    payload: string;
    qos: 0 | 1 | 2;
    retain: boolean;
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
  onMessage(handler: (topic: string, payload: Buffer) => void): () => void;
  onConnect(handler: () => void): () => void;
  onDisconnect(handler: () => void): () => void;
  isConnected(): boolean;
}
