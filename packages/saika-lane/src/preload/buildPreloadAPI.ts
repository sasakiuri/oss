// SPDX-License-Identifier: MIT
import { createProcedureBridge } from '@sasakiuri/saika-ipc/preload';
import { ipcRenderer } from 'electron';

import {
  startupContract,
  competitionContract,
  connectionContract,
  eventsContract,
  mqttContract,
  reportContract,
  sessionContract,
  settingsContract,
  timedTargetContract,
  updaterContract,
  windowContract,
  vistaContract,
} from '@/shared/ipc/contracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

import { createEventBridge } from './createEventBridge';

/**
 * Build the complete preload API from IPC contracts.
 *
 * Most namespaces expose their contract bridge unchanged. The session contract is split into
 * `commands` and `queries`, and three settings procedures take the bare value and wrap it in
 * the contract input.
 */
export function buildPreloadAPI(): ElectronAPI {
  const session = createProcedureBridge(ipcRenderer, sessionContract);
  const settings = createProcedureBridge(ipcRenderer, settingsContract);

  return {
    startup: createProcedureBridge(ipcRenderer, startupContract),
    platform: process.platform,
    hasNativeWindowFrame: process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME === '1',
    appVersion: __APP_VERSION__,

    commands: {
      startSession: session.startSession,
      recordShot: session.recordShot,
      switchMode: session.switchMode,
      resetSession: session.resetSession,
    },

    usb: createProcedureBridge(ipcRenderer, connectionContract),

    queries: {
      getSessionScore: session.getSessionScore,
      getShotHistory: session.getShotHistory,
    },

    competition: createProcedureBridge(ipcRenderer, competitionContract),

    settings: {
      saveConnectionSettings: (settingsData) => settings.saveConnectionSettings({ settings: settingsData }),
      getConnectionSettings: settings.getConnectionSettings,
      saveUserPreferences: (preferences) => settings.saveUserPreferences({ preferences }),
      getUserPreferences: settings.getUserPreferences,
      saveAppSettings: (settingsData) => settings.saveAppSettings({ settings: settingsData }),
      getAppSettings: settings.getAppSettings,
      getSettingsFileInfo: settings.getSettingsFileInfo,
      savePrintSettings: settings.savePrintSettings,
    },

    report: createProcedureBridge(ipcRenderer, reportContract),
    window: createProcedureBridge(ipcRenderer, windowContract),
    mqtt: createProcedureBridge(ipcRenderer, mqttContract),
    timedTarget: createProcedureBridge(ipcRenderer, timedTargetContract),
    vista: createProcedureBridge(ipcRenderer, vistaContract),
    updates: createProcedureBridge(ipcRenderer, updaterContract),
    on: createEventBridge(eventsContract),
  };
}
