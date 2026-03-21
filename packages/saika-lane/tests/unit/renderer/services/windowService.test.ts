// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServiceError } from '@/renderer/services/createServiceMethod';
import { windowService } from '@/renderer/services/windowService';

describe('windowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleFullscreen', () => {
    it('success -> returns FullscreenStateDto', async () => {
      vi.mocked(window.electronAPI.window.toggleFullscreen).mockResolvedValue({
        success: true,
        data: { isFullscreen: true },
      });

      const result = await windowService.toggleFullscreen();

      expect(result).toEqual({ isFullscreen: true });
      expect(window.electronAPI.window.toggleFullscreen).toHaveBeenCalledTimes(1);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.window.toggleFullscreen).mockResolvedValue({
        success: false,
        error: { code: 'WINDOW_ERROR', message: 'Cannot toggle fullscreen' },
      });

      await expect(windowService.toggleFullscreen()).rejects.toThrow(ServiceError);
      await expect(windowService.toggleFullscreen()).rejects.toMatchObject({
        code: 'WINDOW_ERROR',
      });
    });

    it('IPC communication error -> IPC_ERROR', async () => {
      vi.mocked(window.electronAPI.window.toggleFullscreen).mockRejectedValue(new Error('IPC timeout'));

      await expect(windowService.toggleFullscreen()).rejects.toMatchObject({
        code: 'IPC_ERROR',
        message: 'IPC timeout',
      });
    });
  });

  describe('minimize', () => {
    it('success -> returns void', async () => {
      vi.mocked(window.electronAPI.window.minimize).mockResolvedValue({
        success: true,
      });

      await expect(windowService.minimize()).resolves.toBeUndefined();
      expect(window.electronAPI.window.minimize).toHaveBeenCalledTimes(1);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.window.minimize).mockResolvedValue({
        success: false,
        error: { code: 'WINDOW_NOT_FOUND', message: 'No focused window found' },
      });

      await expect(windowService.minimize()).rejects.toThrow(ServiceError);
      await expect(windowService.minimize()).rejects.toMatchObject({
        code: 'WINDOW_NOT_FOUND',
      });
    });

    it('IPC communication error -> IPC_ERROR', async () => {
      vi.mocked(window.electronAPI.window.minimize).mockRejectedValue(new Error('IPC failed'));

      await expect(windowService.minimize()).rejects.toMatchObject({
        code: 'IPC_ERROR',
        message: 'IPC failed',
      });
    });
  });

  describe('maximize', () => {
    it('success -> returns WindowStateDto', async () => {
      vi.mocked(window.electronAPI.window.maximize).mockResolvedValue({
        success: true,
        data: { isMaximized: true },
      });

      const result = await windowService.maximize();

      expect(result).toEqual({ isMaximized: true });
      expect(window.electronAPI.window.maximize).toHaveBeenCalledTimes(1);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.window.maximize).mockResolvedValue({
        success: false,
        error: { code: 'WINDOW_NOT_FOUND', message: 'No focused window found' },
      });

      await expect(windowService.maximize()).rejects.toThrow(ServiceError);
      await expect(windowService.maximize()).rejects.toMatchObject({
        code: 'WINDOW_NOT_FOUND',
      });
    });

    it('IPC communication error -> IPC_ERROR', async () => {
      vi.mocked(window.electronAPI.window.maximize).mockRejectedValue(new Error('IPC failed'));

      await expect(windowService.maximize()).rejects.toMatchObject({
        code: 'IPC_ERROR',
        message: 'IPC failed',
      });
    });
  });

  describe('close', () => {
    it('success -> returns void', async () => {
      vi.mocked(window.electronAPI.window.close).mockResolvedValue({
        success: true,
      });

      await expect(windowService.close()).resolves.toBeUndefined();
      expect(window.electronAPI.window.close).toHaveBeenCalledTimes(1);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.window.close).mockResolvedValue({
        success: false,
        error: { code: 'WINDOW_NOT_FOUND', message: 'No focused window found' },
      });

      await expect(windowService.close()).rejects.toThrow(ServiceError);
      await expect(windowService.close()).rejects.toMatchObject({
        code: 'WINDOW_NOT_FOUND',
      });
    });

    it('IPC communication error -> IPC_ERROR', async () => {
      vi.mocked(window.electronAPI.window.close).mockRejectedValue(new Error('IPC failed'));

      await expect(windowService.close()).rejects.toMatchObject({
        code: 'IPC_ERROR',
        message: 'IPC failed',
      });
    });
  });

  describe('getWindowState', () => {
    it('success -> returns WindowStateDto', async () => {
      vi.mocked(window.electronAPI.window.getWindowState).mockResolvedValue({
        success: true,
        data: { isMaximized: false },
      });

      const result = await windowService.getWindowState();

      expect(result).toEqual({ isMaximized: false });
      expect(window.electronAPI.window.getWindowState).toHaveBeenCalledTimes(1);
    });

    it('failure → ServiceError', async () => {
      vi.mocked(window.electronAPI.window.getWindowState).mockResolvedValue({
        success: false,
        data: null,
        error: { code: 'UNKNOWN', message: 'Unknown error' },
      });

      await expect(windowService.getWindowState()).rejects.toThrow(ServiceError);
      await expect(windowService.getWindowState()).rejects.toMatchObject({
        code: 'UNKNOWN',
      });
    });

    it('IPC communication error -> IPC_ERROR', async () => {
      vi.mocked(window.electronAPI.window.getWindowState).mockRejectedValue(new Error('Bridge error'));

      await expect(windowService.getWindowState()).rejects.toMatchObject({
        code: 'IPC_ERROR',
        message: 'Bridge error',
      });
    });
  });
});
