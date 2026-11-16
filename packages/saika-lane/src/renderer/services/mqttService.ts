// SPDX-License-Identifier: MIT
import { createServiceMethod } from './createServiceMethod';

export const mqttService = {
  connectMqtt: createServiceMethod((api) => api.mqtt.connectMqtt),
  disconnectMqtt: createServiceMethod((api) => api.mqtt.disconnectMqtt),
  getMqttStatus: createServiceMethod((api) => api.mqtt.getMqttStatus),
  getDirectorMembership: createServiceMethod((api) => api.mqtt.getDirectorMembership),
  getSafetyState: createServiceMethod((api) => api.mqtt.getSafetyState),
  getRangeOfficerRequest: createServiceMethod((api) => api.mqtt.getRangeOfficerRequest),
  requestRangeOfficer: createServiceMethod((api) => api.mqtt.requestRangeOfficer),
  clearRangeOfficerRequest: createServiceMethod((api) => api.mqtt.clearRangeOfficerRequest),
  getQualificationMalfunctionSignal: createServiceMethod((api) => api.mqtt.getQualificationMalfunctionSignal),
  declareQualificationMalfunction: createServiceMethod((api) => api.mqtt.declareQualificationMalfunction),
  clearQualificationMalfunctionSignal: createServiceMethod((api) => api.mqtt.clearQualificationMalfunctionSignal),
  getEstComplaintSignal: createServiceMethod((api) => api.mqtt.getEstComplaintSignal),
  getEstComplaintContext: createServiceMethod((api) => api.mqtt.getEstComplaintContext),
  declareEstComplaint: createServiceMethod((api) => api.mqtt.declareEstComplaint),
  clearEstComplaintSignal: createServiceMethod((api) => api.mqtt.clearEstComplaintSignal),
  saveMqttSettings: createServiceMethod((api) => api.mqtt.saveMqttSettings),
  getMqttSettings: createServiceMethod((api) => api.mqtt.getMqttSettings),
};
