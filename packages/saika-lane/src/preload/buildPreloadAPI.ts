// SPDX-License-Identifier: MIT
import {
  competitionContract,
  connectionContract,
  eventsContract,
  mqttContract,
  reportContract,
  sessionContract,
  settingsContract,
  windowContract,
} from '@/shared/ipc/contracts';
import type { ElectronAPI } from '@/shared/types/ElectronAPI';

import { createBridgeNamespace } from './createBridge';
import { createEventBridge } from './createEventBridge';

/**
 * Build the complete preload API from IPC contracts.
 *
 * Maps contract-generated bridges into the ElectronAPI structure
 * expected by the Renderer process.
 */
export function buildPreloadAPI(): ElectronAPI {
  const session = createBridgeNamespace(sessionContract);
  const connection = createBridgeNamespace(connectionContract);
  const competition = createBridgeNamespace(competitionContract);
  const settings = createBridgeNamespace(settingsContract);
  const events = createEventBridge(eventsContract);
  const report = createBridgeNamespace(reportContract);
  const window = createBridgeNamespace(windowContract);
  const mqtt = createBridgeNamespace(mqttContract);
  const hasNativeWindowFrame = process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME === '1';

  return {
    platform: process.platform,
    hasNativeWindowFrame,
    appVersion: __APP_VERSION__,

    commands: {
      startSession: session.startSession,
      recordShot: session.recordShot,
      switchMode: session.switchMode,
      resetSession: session.resetSession,
    },

    usb: {
      connect: connection.connect,
      disconnect: connection.disconnect,
      listPorts: connection.listPorts,
      getDevicesByManufacturer: connection.getDevicesByManufacturer,
    },

    queries: {
      getSessionScore: session.getSessionScore,
      getShotHistory: session.getShotHistory,
    },

    competition: {
      startCompetition: competition.startCompetition,
      startStage: competition.startStage,
      startNextSeries: competition.startNextSeries,
      endStage: competition.endStage,
      advanceStage: competition.advanceStage,
      finishCompetition: competition.finishCompetition,
      getCompetitionState: competition.getCompetitionState,
      getCompetitionTypes: competition.getCompetitionTypes,
    },

    settings: {
      saveConnectionSettings: (settingsData) => settings.saveConnectionSettings({ settings: settingsData }),
      getConnectionSettings: settings.getConnectionSettings,
      saveUserPreferences: (preferences) => settings.saveUserPreferences({ preferences }),
      getUserPreferences: settings.getUserPreferences,
      saveAppSettings: (settingsData) => settings.saveAppSettings({ settings: settingsData }),
      getAppSettings: settings.getAppSettings,
      getSettingsFileInfo: settings.getSettingsFileInfo,
    },

    report: {
      getScoreSheet: report.getScoreSheet,
      openPrintWindow: report.openPrintWindow,
    },

    window: {
      toggleFullscreen: window.toggleFullscreen,
      minimize: window.minimize,
      maximize: window.maximize,
      close: window.close,
      getWindowState: window.getWindowState,
    },

    mqtt: {
      connectMqtt: mqtt.connectMqtt,
      disconnectMqtt: mqtt.disconnectMqtt,
      getMqttStatus: mqtt.getMqttStatus,
      saveMqttSettings: mqtt.saveMqttSettings,
      getMqttSettings: mqtt.getMqttSettings,
    },

    on: {
      shotReceived: events.shotReceived,
      shotRecorded: events.shotRecorded,
      connectionStatusChanged: events.connectionStatusChanged,
      sessionStarted: events.sessionStarted,
      modeSwitched: events.modeSwitched,
      sessionReset: events.sessionReset,
      error: events.error,
      logMessage: events.logMessage,
      competitionStarted: events.competitionStarted,
      phaseChanged: events.phaseChanged,
      timerTick: events.timerTick,
      timerExpired: events.timerExpired,
      seriesCompleted: events.seriesCompleted,
      stageAdvanced: events.stageAdvanced,
      competitionFinished: events.competitionFinished,
      mqttStatusChanged: events.mqttStatusChanged,
      fullscreenChanged: events.fullscreenChanged,
    },
  };
}
