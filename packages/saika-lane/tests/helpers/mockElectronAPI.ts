// SPDX-License-Identifier: MIT
import { vi } from 'vitest';

// Electron API type definition (new format - via preload)
export interface MockedElectronAPI {
  platform: string;
  hasNativeWindowFrame: boolean;
  appVersion: string;
  commands: {
    startSession: ReturnType<typeof vi.fn>;
    recordShot: ReturnType<typeof vi.fn>;
    switchMode: ReturnType<typeof vi.fn>;
    resetSession: ReturnType<typeof vi.fn>;
  };
  usb: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    listPorts: ReturnType<typeof vi.fn>;
    getDevicesByManufacturer: ReturnType<typeof vi.fn>;
  };
  queries: {
    getSessionScore: ReturnType<typeof vi.fn>;
    getShotHistory: ReturnType<typeof vi.fn>;
  };
  settings: {
    saveConnectionSettings: ReturnType<typeof vi.fn>;
    getConnectionSettings: ReturnType<typeof vi.fn>;
    saveUserPreferences: ReturnType<typeof vi.fn>;
    getUserPreferences: ReturnType<typeof vi.fn>;
    saveAppSettings: ReturnType<typeof vi.fn>;
    getAppSettings: ReturnType<typeof vi.fn>;
    getSettingsFileInfo: ReturnType<typeof vi.fn>;
  };
  competition: {
    startCompetition: ReturnType<typeof vi.fn>;
    startStage: ReturnType<typeof vi.fn>;
    endStage: ReturnType<typeof vi.fn>;
    startNextSeries: ReturnType<typeof vi.fn>;
    advanceStage: ReturnType<typeof vi.fn>;
    finishCompetition: ReturnType<typeof vi.fn>;
    getCompetitionState: ReturnType<typeof vi.fn>;
    getCompetitionTypes: ReturnType<typeof vi.fn>;
  };
  report: {
    getScoreSheet: ReturnType<typeof vi.fn>;
    openPrintWindow: ReturnType<typeof vi.fn>;
  };
  window: {
    toggleFullscreen: ReturnType<typeof vi.fn>;
    minimize: ReturnType<typeof vi.fn>;
    maximize: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    getWindowState: ReturnType<typeof vi.fn>;
  };
  on: {
    shotReceived: ReturnType<typeof vi.fn>;
    shotRecorded: ReturnType<typeof vi.fn>;
    connectionStatusChanged: ReturnType<typeof vi.fn>;
    sessionStarted: ReturnType<typeof vi.fn>;
    modeSwitched: ReturnType<typeof vi.fn>;
    sessionReset: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    logMessage: ReturnType<typeof vi.fn>;
    competitionStarted: ReturnType<typeof vi.fn>;
    phaseChanged: ReturnType<typeof vi.fn>;
    timerTick: ReturnType<typeof vi.fn>;
    timerExpired: ReturnType<typeof vi.fn>;
    seriesCompleted: ReturnType<typeof vi.fn>;
    stageAdvanced: ReturnType<typeof vi.fn>;
    competitionFinished: ReturnType<typeof vi.fn>;
  };
}

export function createMockElectronAPI(): MockedElectronAPI {
  return {
    platform: 'linux',
    hasNativeWindowFrame: false,
    appVersion: '0.1.0',
    commands: {
      startSession: vi.fn(),
      recordShot: vi.fn(),
      switchMode: vi.fn(),
      resetSession: vi.fn(),
    },
    usb: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      listPorts: vi.fn().mockResolvedValue({
        success: true,
        data: {
          ports: [
            { path: 'COM3', manufacturer: 'FTDI' },
            { path: 'COM4', manufacturer: 'Prolific' },
            { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
            { path: '/dev/ttyUSB1', manufacturer: undefined },
          ],
        },
      }),
      getDevicesByManufacturer: vi.fn(),
    },
    queries: {
      getSessionScore: vi.fn(),
      getShotHistory: vi.fn(),
    },
    settings: {
      saveConnectionSettings: vi.fn().mockResolvedValue(undefined),
      getConnectionSettings: vi.fn().mockResolvedValue({ success: true, data: {} }),
      saveUserPreferences: vi.fn().mockResolvedValue(undefined),
      getUserPreferences: vi.fn().mockResolvedValue({ success: true, data: {} }),
      saveAppSettings: vi.fn().mockResolvedValue(undefined),
      getAppSettings: vi.fn().mockResolvedValue({
        success: true,
        data: {
          connection: { portName: '', manufacturer: 'KOHTO', deviceId: '' },
          userPreferences: { laneNumber: 1, discipline: null, competitionTypeId: '', audioVolume: 50 },
          mqtt: {
            enabled: false,
            brokerUrl: '',
            laneAlias: '',
            autoConnect: false,
            laneId: '550e8400-e29b-41d4-a716-446655440000',
          },
        },
      }),
      getSettingsFileInfo: vi.fn().mockResolvedValue({ success: true, data: { path: '/tmp/settings.json' } }),
    },
    competition: {
      startCompetition: vi.fn(),
      startStage: vi.fn(),
      endStage: vi.fn(),
      startNextSeries: vi.fn(),
      advanceStage: vi.fn(),
      finishCompetition: vi.fn(),
      getCompetitionState: vi.fn(),
      getCompetitionTypes: vi.fn(),
    },
    report: {
      getScoreSheet: vi.fn(),
      openPrintWindow: vi.fn(),
    },
    window: {
      toggleFullscreen: vi.fn(),
      minimize: vi.fn().mockResolvedValue({ success: true }),
      maximize: vi.fn().mockResolvedValue({ success: true, data: { isMaximized: false } }),
      close: vi.fn().mockResolvedValue({ success: true }),
      getWindowState: vi.fn().mockResolvedValue({ success: true, data: { isMaximized: false } }),
    },
    on: {
      shotReceived: vi.fn().mockReturnValue(() => {}),
      shotRecorded: vi.fn().mockReturnValue(() => {}),
      connectionStatusChanged: vi.fn().mockReturnValue(() => {}),
      sessionStarted: vi.fn().mockReturnValue(() => {}),
      modeSwitched: vi.fn().mockReturnValue(() => {}),
      sessionReset: vi.fn().mockReturnValue(() => {}),
      error: vi.fn().mockReturnValue(() => {}),
      logMessage: vi.fn().mockReturnValue(() => {}),
      competitionStarted: vi.fn().mockReturnValue(() => {}),
      phaseChanged: vi.fn().mockReturnValue(() => {}),
      timerTick: vi.fn().mockReturnValue(() => {}),
      timerExpired: vi.fn().mockReturnValue(() => {}),
      seriesCompleted: vi.fn().mockReturnValue(() => {}),
      stageAdvanced: vi.fn().mockReturnValue(() => {}),
      competitionFinished: vi.fn().mockReturnValue(() => {}),
    },
  };
}
