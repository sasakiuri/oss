// SPDX-License-Identifier: MIT
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Mock electron modules before importing preload
const mockIpcRendererInvoke = vi.fn();
const mockIpcRendererOn = vi.fn();
const mockIpcRendererOff = vi.fn();
const mockIpcRendererRemoveListener = vi.fn();
const mockContextBridgeExposeInMainWorld = vi.fn();

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockContextBridgeExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockIpcRendererInvoke,
    on: mockIpcRendererOn,
    off: mockIpcRendererOff,
    removeListener: mockIpcRendererRemoveListener,
  },
}));

describe('Preload Script', () => {
  let exposedApi: any;

  beforeAll(async () => {
    // Import preload script once before all tests
    await import('@/preload/preload');

    // Extract the exposed API from the mock call
    exposedApi = mockContextBridgeExposeInMainWorld.mock.calls[0]?.[1];
  });

  describe('ElectronAPI exposure', () => {
    it('should expose electronAPI to main world', () => {
      // Verify contextBridge.exposeInMainWorld was called
      expect(mockContextBridgeExposeInMainWorld).toHaveBeenCalledTimes(1);
      expect(mockContextBridgeExposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object));
    });

    it('should expose platform property', () => {
      expect(exposedApi).toHaveProperty('platform');
      expect(typeof exposedApi.platform).toBe('string');
    });

    it('should expose native frame capability flag', () => {
      expect(exposedApi).toHaveProperty('hasNativeWindowFrame');
      expect(typeof exposedApi.hasNativeWindowFrame).toBe('boolean');
    });

    it('should expose commands object', () => {
      expect(exposedApi).toHaveProperty('commands');
      expect(exposedApi.commands).toHaveProperty('startSession');
      expect(exposedApi.commands).toHaveProperty('recordShot');
      expect(exposedApi.commands).toHaveProperty('switchMode');
      expect(exposedApi.commands).toHaveProperty('resetSession');
    });

    it('should expose usb object', () => {
      expect(exposedApi).toHaveProperty('usb');
      expect(exposedApi.usb).toHaveProperty('connect');
      expect(exposedApi.usb).toHaveProperty('disconnect');
    });

    it('should expose queries object', () => {
      expect(exposedApi).toHaveProperty('queries');
      expect(exposedApi.queries).toHaveProperty('getSessionScore');
      expect(exposedApi.queries).toHaveProperty('getShotHistory');
    });

    it('should expose on object with event listeners', () => {
      expect(exposedApi).toHaveProperty('on');
      expect(exposedApi.on).toHaveProperty('shotRecorded');
      expect(exposedApi.on).toHaveProperty('connectionStatusChanged');
      expect(exposedApi.on).toHaveProperty('sessionStarted');
      expect(exposedApi.on).toHaveProperty('modeSwitched');
      expect(exposedApi.on).toHaveProperty('sessionReset');
      expect(exposedApi.on).toHaveProperty('error');
    });
  });

  describe('Commands API', () => {
    it('should have startSession as a function', () => {
      expect(typeof exposedApi.commands.startSession).toBe('function');
    });

    it('should have recordShot as a function', () => {
      expect(typeof exposedApi.commands.recordShot).toBe('function');
    });

    it('should have switchMode as a function', () => {
      expect(typeof exposedApi.commands.switchMode).toBe('function');
    });

    it('should have resetSession as a function', () => {
      expect(typeof exposedApi.commands.resetSession).toBe('function');
    });
  });

  describe('USB API', () => {
    it('should have connect as a function', () => {
      expect(typeof exposedApi.usb.connect).toBe('function');
    });

    it('should have disconnect as a function', () => {
      expect(typeof exposedApi.usb.disconnect).toBe('function');
    });
  });

  describe('Queries API', () => {
    it('should have getSessionScore as a function', () => {
      expect(typeof exposedApi.queries.getSessionScore).toBe('function');
    });

    it('should have getShotHistory as a function', () => {
      expect(typeof exposedApi.queries.getShotHistory).toBe('function');
    });
  });

  describe('Event listeners', () => {
    it('should have shotRecorded listener as a function', () => {
      expect(typeof exposedApi.on.shotRecorded).toBe('function');
    });

    it('should have connectionStatusChanged listener as a function', () => {
      expect(typeof exposedApi.on.connectionStatusChanged).toBe('function');
    });

    it('should have sessionStarted listener as a function', () => {
      expect(typeof exposedApi.on.sessionStarted).toBe('function');
    });

    it('should have modeSwitched listener as a function', () => {
      expect(typeof exposedApi.on.modeSwitched).toBe('function');
    });

    it('should have sessionReset listener as a function', () => {
      expect(typeof exposedApi.on.sessionReset).toBe('function');
    });

    it('should have error listener as a function', () => {
      expect(typeof exposedApi.on.error).toBe('function');
    });

    it('should return cleanup function from event listener', () => {
      const callback = vi.fn();
      const cleanup = exposedApi.on.shotRecorded(callback);

      expect(typeof cleanup).toBe('function');
    });

    it('should call ipcRenderer.on when subscribing to event', () => {
      vi.clearAllMocks();

      const callback = vi.fn();
      exposedApi.on.shotRecorded(callback);

      expect(mockIpcRendererOn).toHaveBeenCalledTimes(1);
      expect(mockIpcRendererOn).toHaveBeenCalledWith('event:shotRecorded', expect.any(Function));
    });

    it('should call ipcRenderer.removeListener when cleanup is invoked', () => {
      vi.clearAllMocks();

      const callback = vi.fn();
      const cleanup = exposedApi.on.shotRecorded(callback);

      // Call cleanup
      cleanup();

      expect(mockIpcRendererRemoveListener).toHaveBeenCalledTimes(1);
      expect(mockIpcRendererRemoveListener).toHaveBeenCalledWith('event:shotRecorded', expect.any(Function));
    });
  });
});
