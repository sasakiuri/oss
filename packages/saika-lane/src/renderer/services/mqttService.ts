// SPDX-License-Identifier: MIT
import type {
  ClearEstComplaintSignalInput,
  ClearQualificationMalfunctionSignalInput,
  ClearRangeOfficerRequestInput,
  ConnectMqttInput,
  DeclareEstComplaintInput,
  DeclareQualificationMalfunctionInput,
  EstComplaintContextDto,
  EstComplaintSignalDto,
  LaneSafetyStateDto,
  MqttSettings,
  MqttStatus,
  QualificationMalfunctionSignalDto,
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

  getQualificationMalfunctionSignal: createVoidServiceMethod<QualificationMalfunctionSignalDto>(() =>
    window.electronAPI.mqtt.getQualificationMalfunctionSignal(),
  ),

  declareQualificationMalfunction: createServiceMethod<
    DeclareQualificationMalfunctionInput,
    QualificationMalfunctionSignalDto
  >((input) => window.electronAPI.mqtt.declareQualificationMalfunction(input)),

  clearQualificationMalfunctionSignal: createServiceMethod<
    ClearQualificationMalfunctionSignalInput,
    QualificationMalfunctionSignalDto
  >((input) => window.electronAPI.mqtt.clearQualificationMalfunctionSignal(input)),

  getEstComplaintSignal: createVoidServiceMethod<EstComplaintSignalDto>(() =>
    window.electronAPI.mqtt.getEstComplaintSignal(),
  ),
  getEstComplaintContext: createVoidServiceMethod<EstComplaintContextDto>(() =>
    window.electronAPI.mqtt.getEstComplaintContext(),
  ),

  declareEstComplaint: createServiceMethod<DeclareEstComplaintInput, EstComplaintSignalDto>((input) =>
    window.electronAPI.mqtt.declareEstComplaint(input),
  ),

  clearEstComplaintSignal: createServiceMethod<ClearEstComplaintSignalInput, EstComplaintSignalDto>((input) =>
    window.electronAPI.mqtt.clearEstComplaintSignal(input),
  ),

  saveMqttSettings: createCommandMethod<MqttSettings>((settings) => window.electronAPI.mqtt.saveMqttSettings(settings)),

  getMqttSettings: createVoidServiceMethod<MqttSettings>(() => window.electronAPI.mqtt.getMqttSettings()),
};
