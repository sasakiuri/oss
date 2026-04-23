// SPDX-License-Identifier: MIT
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockOn = vi.hoisted(() => vi.fn());
const mockRemoveListener = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener,
  },
}));

import { buildPreloadAPI } from '@/preload/buildPreloadAPI';

describe('buildPreloadAPI', () => {
  const api = buildPreloadAPI();
  const originalNativeWindowFrameEnv = process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME;

  afterEach(() => {
    if (originalNativeWindowFrameEnv === undefined) {
      delete process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME;
      return;
    }

    process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = originalNativeWindowFrameEnv;
  });

  describe('top-level structure', () => {
    it('should have platform property', () => {
      expect(api.platform).toBe(process.platform);
    });

    it('should expose whether the window uses native frame chrome', () => {
      expect(api.hasNativeWindowFrame).toBeTypeOf('boolean');
    });

    it('reads native frame capability from the preload environment', () => {
      process.env.SAIKA_LANE_NATIVE_WINDOW_FRAME = '1';

      expect(buildPreloadAPI().hasNativeWindowFrame).toBe(true);
    });

    it('should contain all expected namespaces', () => {
      expect(api).toHaveProperty('commands');
      expect(api).toHaveProperty('usb');
      expect(api).toHaveProperty('queries');
      expect(api).toHaveProperty('competition');
      expect(api).toHaveProperty('settings');
      expect(api).toHaveProperty('report');
      expect(api).toHaveProperty('window');
      expect(api).toHaveProperty('on');
    });
  });

  describe('competition namespace', () => {
    it('should expose all competition methods as functions', () => {
      expect(typeof api.competition.startCompetition).toBe('function');
      expect(typeof api.competition.startStage).toBe('function');
      expect(typeof api.competition.startNextSeries).toBe('function');
      expect(typeof api.competition.endStage).toBe('function');
      expect(typeof api.competition.advanceStage).toBe('function');
      expect(typeof api.competition.finishCompetition).toBe('function');
      expect(typeof api.competition.getCompetitionState).toBe('function');
      expect(typeof api.competition.getCompetitionTypes).toBe('function');
    });
  });

  describe('settings namespace', () => {
    it('should expose all settings methods as functions', () => {
      expect(typeof api.settings.saveConnectionSettings).toBe('function');
      expect(typeof api.settings.getConnectionSettings).toBe('function');
      expect(typeof api.settings.saveUserPreferences).toBe('function');
      expect(typeof api.settings.getUserPreferences).toBe('function');
      expect(typeof api.settings.saveAppSettings).toBe('function');
      expect(typeof api.settings.getAppSettings).toBe('function');
      expect(typeof api.settings.getSettingsFileInfo).toBe('function');
    });

    it('should wrap saveConnectionSettings payload with settings key', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const settingsData = { portName: 'COM3', manufacturer: 'KOHTO' as const };

      await api.settings.saveConnectionSettings(settingsData);

      expect(mockInvoke).toHaveBeenCalledWith(expect.any(String), { settings: settingsData });
    });

    it('should wrap saveUserPreferences payload with preferences key', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const prefs = { laneNumber: 1 };

      await api.settings.saveUserPreferences(prefs);

      expect(mockInvoke).toHaveBeenCalledWith(expect.any(String), { preferences: prefs });
    });

    it('should wrap saveAppSettings payload with settings key', async () => {
      mockInvoke.mockResolvedValue({ success: true });
      const settingsData = {
        connection: {
          portName: '',
          manufacturer: 'KOHTO' as const,
          deviceId: '',
          serialNumber: '',
          vendorId: '',
          productId: '',
        },
        userPreferences: { laneNumber: 1, discipline: null, competitionTypeId: '', audioVolume: 50 },
        mqtt: {
          enabled: false,
          brokerUrl: '',
          laneAlias: '',
          autoConnect: false,
          laneId: '550e8400-e29b-41d4-a716-446655440000',
        },
      };

      await api.settings.saveAppSettings(settingsData);

      expect(mockInvoke).toHaveBeenCalledWith(expect.any(String), { settings: settingsData });
    });
  });

  describe('report namespace', () => {
    it('should expose report methods as functions', () => {
      expect(typeof api.report.getScoreSheet).toBe('function');
      expect(typeof api.report.openPrintWindow).toBe('function');
    });
  });

  describe('window namespace', () => {
    it('should expose toggleFullscreen as a function', () => {
      expect(typeof api.window.toggleFullscreen).toBe('function');
    });
  });

  describe('on (events) namespace', () => {
    it('should expose all competition event subscriptions', () => {
      expect(typeof api.on.competitionStarted).toBe('function');
      expect(typeof api.on.phaseChanged).toBe('function');
      expect(typeof api.on.timerTick).toBe('function');
      expect(typeof api.on.timerExpired).toBe('function');
      expect(typeof api.on.seriesCompleted).toBe('function');
      expect(typeof api.on.stageAdvanced).toBe('function');
      expect(typeof api.on.competitionFinished).toBe('function');
    });

    it('should expose shotReceived event subscription', () => {
      expect(typeof api.on.shotReceived).toBe('function');
    });

    it('should expose logMessage event subscription', () => {
      expect(typeof api.on.logMessage).toBe('function');
    });
  });
});
