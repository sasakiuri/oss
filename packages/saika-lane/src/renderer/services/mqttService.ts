// SPDX-License-Identifier: MIT
import type {
  ClearRangeOfficerRequestInput,
  ConnectMqttInput,
  LaneSafetyStateDto,
  MqttSettings,
  MqttStatus,
  RangeOfficerRequestDto,
  RequestRangeOfficerInput,
} from '@/shared/ipc/contracts';

import {
  createCommandMethod,
  createServiceMethod,
  createVoidCommandMethod,
  createVoidServiceMethod,
} from './createServiceMethod';

export const mqttService = {
  connectMqtt: createCommandMethod<ConnectMqttInput>((input) => window.electronAPI.mqtt.connectMqtt(input)),

  disconnectMqtt: createVoidCommandMethod(() => window.electronAPI.mqtt.disconnectMqtt()),

  getMqttStatus: createVoidServiceMethod<MqttStatus>(() => window.electronAPI.mqtt.getMqttStatus()),

  getSafetyState: createVoidServiceMethod<LaneSafetyStateDto>(() => window.electronAPI.mqtt.getSafetyState()),

  getRangeOfficerRequest: createVoidServiceMethod<RangeOfficerRequestDto>(() =>
    window.electronAPI.mqtt.getRangeOfficerRequest(),
  ),

  requestRangeOfficer: createServiceMethod<RequestRangeOfficerInput, RangeOfficerRequestDto>((input) =>
    window.electronAPI.mqtt.requestRangeOfficer(input),
  ),

  clearRangeOfficerRequest: createServiceMethod<ClearRangeOfficerRequestInput, RangeOfficerRequestDto>((input) =>
    window.electronAPI.mqtt.clearRangeOfficerRequest(input),
  ),

  saveMqttSettings: createCommandMethod<MqttSettings>((settings) => window.electronAPI.mqtt.saveMqttSettings(settings)),

  getMqttSettings: createVoidServiceMethod<MqttSettings>(() => window.electronAPI.mqtt.getMqttSettings()),
};
