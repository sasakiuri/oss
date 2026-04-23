// SPDX-License-Identifier: MIT
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTitleBar } from '@/renderer/presentation/hooks/useTitleBar';
import { windowService } from '@/renderer/services/windowService';

vi.mock('@/renderer/services/windowService', () => ({
  windowService: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    getWindowState: vi.fn(),
  },
}));

const mockGetWindowState = vi.mocked(windowService.getWindowState);
const mockMinimize = vi.mocked(windowService.minimize);
const mockMaximize = vi.mocked(windowService.maximize);
const mockClose = vi.mocked(windowService.close);
const mockOnFullscreenChanged = vi.mocked(window.electronAPI.on.fullscreenChanged);

describe('useTitleBar', () => {
  let fullscreenChangedCallback: ((state: { isFullscreen: boolean }) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    fullscreenChangedCallback = undefined;
    mockGetWindowState.mockResolvedValue({ isMaximized: false, isFullscreen: false });
    mockMinimize.mockResolvedValue(undefined);
    mockMaximize.mockResolvedValue({ isMaximized: true, isFullscreen: false });
    mockClose.mockResolvedValue(undefined);
    mockOnFullscreenChanged.mockImplementation((callback) => {
      fullscreenChangedCallback = callback;
      return vi.fn();
    });
  });

  describe('initial state', () => {
    it('initializes isMaximized to false', () => {
      const { result } = renderHook(() => useTitleBar());
      expect(result.current.isMaximized).toBe(false);
      expect(result.current.isFullscreen).toBe(false);
    });

    it('calls getWindowState on mount', async () => {
      mockGetWindowState.mockResolvedValue({ isMaximized: true, isFullscreen: true });

      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isMaximized).toBe(true);
      expect(result.current.isFullscreen).toBe(true);
      expect(mockGetWindowState).toHaveBeenCalledTimes(1);
    });

    it('does not crash when getWindowState fails', async () => {
      mockGetWindowState.mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(result.current.isMaximized).toBe(false);
      expect(result.current.isFullscreen).toBe(false);
    });

    it('subscribes to fullscreen changes', async () => {
      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        fullscreenChangedCallback?.({ isFullscreen: true });
      });

      expect(result.current.isFullscreen).toBe(true);
      expect(mockOnFullscreenChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMinimize', () => {
    it('calls windowService.minimize', async () => {
      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        result.current.handleMinimize();
      });

      expect(mockMinimize).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleMaximize', () => {
    it('calls windowService.maximize and updates isMaximized', async () => {
      mockMaximize.mockResolvedValue({ isMaximized: true, isFullscreen: false });

      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        result.current.handleMaximize();
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isMaximized).toBe(true);
      expect(mockMaximize).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleClose', () => {
    it('calls windowService.close', async () => {
      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        result.current.handleClose();
      });

      expect(mockClose).toHaveBeenCalledTimes(1);
    });
  });
});
