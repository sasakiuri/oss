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
 * Maps contract-generated bridges into the ElectronAPI structure
 * expected by the Renderer process.
 */
export function buildPreloadAPI(): ElectronAPI {
  const session = createProcedureBridge(ipcRenderer, sessionContract);
  const connection = createProcedureBridge(ipcRenderer, connectionContract);
  const competition = createProcedureBridge(ipcRenderer, competitionContract);
  const settings = createProcedureBridge(ipcRenderer, settingsContract);
  const events = createEventBridge(eventsContract);
  const report = createProcedureBridge(ipcRenderer, reportContract);
  const window = createProcedureBridge(ipcRenderer, windowContract);
  const mqtt = createProcedureBridge(ipcRenderer, mqttContract);
  const updates = createProcedureBridge(ipcRenderer, updaterContract);
  const timedTarget = createProcedureBridge(ipcRenderer, timedTargetContract);
  const hasNativeWindowFrame = process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME === '1';

  return {
    startup: createProcedureBridge(ipcRenderer, startupContract),
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
      setAthleteTargetMode: competition.setAthleteTargetMode,
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
      savePrintSettings: settings.savePrintSettings,
    },

    report: {
      getScoreSheet: report.getScoreSheet,
      openPrintWindow: report.openPrintWindow,
      listPrinters: report.listPrinters,
      printReady: report.printReady,
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
      getDirectorMembership: mqtt.getDirectorMembership,
      getSafetyState: mqtt.getSafetyState,
      getRangeOfficerRequest: mqtt.getRangeOfficerRequest,
      requestRangeOfficer: mqtt.requestRangeOfficer,
      clearRangeOfficerRequest: mqtt.clearRangeOfficerRequest,
      getQualificationMalfunctionSignal: mqtt.getQualificationMalfunctionSignal,
      declareQualificationMalfunction: mqtt.declareQualificationMalfunction,
      clearQualificationMalfunctionSignal: mqtt.clearQualificationMalfunctionSignal,
      getEstComplaintSignal: mqtt.getEstComplaintSignal,
      getEstComplaintContext: mqtt.getEstComplaintContext,
      declareEstComplaint: mqtt.declareEstComplaint,
      clearEstComplaintSignal: mqtt.clearEstComplaintSignal,
      saveMqttSettings: mqtt.saveMqttSettings,
      getMqttSettings: mqtt.getMqttSettings,
    },

    timedTarget,
    vista: createProcedureBridge(ipcRenderer, vistaContract),

    updates: {
      getUpdateState: updates.getUpdateState,
      checkForUpdates: updates.checkForUpdates,
      quitAndInstall: updates.quitAndInstall,
    },

    on: {
      shotReceived: events.shotReceived,
      shotRecorded: events.shotRecorded,
      positionExtraNullified: events.positionExtraNullified,
      connectionStatusChanged: events.connectionStatusChanged,
      sessionStarted: events.sessionStarted,
      modeSwitched: events.modeSwitched,
      sessionReset: events.sessionReset,
      error: events.error,
      logMessage: events.logMessage,
      competitionStarted: events.competitionStarted,
      phaseChanged: events.phaseChanged,
      competitionProgressChanged: events.competitionProgressChanged,
      timerTick: events.timerTick,
      timerExpired: events.timerExpired,
      competitionInterruptionChanged: events.competitionInterruptionChanged,
      safetyStopChanged: events.safetyStopChanged,
      competitionCueChanged: events.competitionCueChanged,
      timedTargetSequenceChanged: events.timedTargetSequenceChanged,
      seriesCompleted: events.seriesCompleted,
      stageAdvanced: events.stageAdvanced,
      competitionFinished: events.competitionFinished,
      mqttStatusChanged: events.mqttStatusChanged,
      directorMembershipChanged: events.directorMembershipChanged,
      fullscreenChanged: events.fullscreenChanged,
      updateStateChanged: events.updateStateChanged,
    },
  };
}
