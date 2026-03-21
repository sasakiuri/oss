// SPDX-License-Identifier: MIT
import type { ConnectMqttInput, MqttSettings, MqttStatus } from '@/shared/ipc/contracts';

import { createCommandMethod, createVoidCommandMethod, createVoidServiceMethod } from './createServiceMethod';

export const mqttService = {
  connectMqtt: createCommandMethod<ConnectMqttInput>((input) => window.electronAPI.mqtt.connectMqtt(input)),

  disconnectMqtt: createVoidCommandMethod(() => window.electronAPI.mqtt.disconnectMqtt()),

  getMqttStatus: createVoidServiceMethod<MqttStatus>(() => window.electronAPI.mqtt.getMqttStatus()),

  saveMqttSettings: createCommandMethod<MqttSettings>((settings) => window.electronAPI.mqtt.saveMqttSettings(settings)),

  getMqttSettings: createVoidServiceMethod<MqttSettings>(() => window.electronAPI.mqtt.getMqttSettings()),
};
