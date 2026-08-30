// SPDX-License-Identifier: MIT

export const mqttTopics = {
  laneHardwareState: (laneId: string) => `saika/lane/${laneId}/hardware/state`,
  laneHardwareShot: (laneId: string) => `saika/lane/${laneId}/hardware/shot`,
  laneSafetyState: (laneId: string) => `saika/lane/${laneId}/safety/state`,
  laneCommand: (laneId: string, action: string) => `saika/lane/${laneId}/command/${action}`,
  laneCommandAcknowledgement: (laneId: string, action: string) =>
    `saika/lane/${laneId}/command/${action}/acknowledgement`,
  competitionState: (competitionId: string) => `saika/competition/${competitionId}/state`,
  competitionCue: (competitionId: string) => `saika/competition/${competitionId}/cue`,
  competitionShootOffShot: (competitionId: string, laneId: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/shoot-off/shot`,
  competitionCommand: (competitionId: string, action: string) => `saika/competition/${competitionId}/command/${action}`,
  competitionCommandAcknowledgement: (competitionId: string, action: string, laneId: string) =>
    `saika/competition/${competitionId}/command/${action}/acknowledgement/${laneId}`,
  laneCompetitionCommand: (competitionId: string, laneId: string, action: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/command/${action}`,
  laneCompetitionCommandAcknowledgement: (competitionId: string, laneId: string, action: string) =>
    `saika/competition/${competitionId}/lane/${laneId}/command/${action}/acknowledgement`,
} as const;

export const directorSubscriptions = [
  'saika/lane/+/hardware/#',
  'saika/lane/+/safety/state',
  'saika/lane/+/command/+/acknowledgement',
  'saika/competition/+/#',
] as const;
