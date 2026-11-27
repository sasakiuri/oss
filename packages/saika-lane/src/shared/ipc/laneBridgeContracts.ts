// SPDX-License-Identifier: MIT
/** The procedure contracts exposed unchanged to the renderer, keyed by their `window.electronAPI` namespace. */
import type { InferBridge } from '@sasakiuri/saika-ipc';

import {
  competitionContract,
  connectionContract,
  mqttContract,
  reportContract,
  settingsContract,
  startupContract,
  timedTargetContract,
  updaterContract,
  vistaContract,
  windowContract,
} from './contracts';

export const laneBridgeContracts = {
  startup: startupContract,
  usb: connectionContract,
  competition: competitionContract,
  settings: settingsContract,
  report: reportContract,
  window: windowContract,
  mqtt: mqttContract,
  timedTarget: timedTargetContract,
  vista: vistaContract,
  updates: updaterContract,
} as const;

/** One method per contract procedure, named by its contract key. */
export type LaneBridge = {
  readonly [N in keyof typeof laneBridgeContracts]: InferBridge<(typeof laneBridgeContracts)[N]>;
};
