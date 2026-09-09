// SPDX-License-Identifier: MIT
export { mqttTopics } from '@sasakiuri/saika-protocol/topics';

export const directorSubscriptions = [
  'saika/lane/+/hardware/#',
  'saika/lane/+/safety/state',
  'saika/lane/+/range-officer/request',
  'saika/lane/+/qualification-malfunction/signal',
  'saika/lane/+/est-complaint/signal',
  'saika/lane/+/command/+/acknowledgement',
  'saika/competition/+/#',
] as const;
