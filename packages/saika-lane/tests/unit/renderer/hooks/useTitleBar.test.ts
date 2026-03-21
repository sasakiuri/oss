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

describe('useTitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetWindowState.mockResolvedValue({ isMaximized: false });
    mockMinimize.mockResolvedValue(undefined);
    mockMaximize.mockResolvedValue({ isMaximized: true });
    mockClose.mockResolvedValue(undefined);
  });

  describe('initial state', () => {
    it('initializes isMaximized to false', () => {
      const { result } = renderHook(() => useTitleBar());
      expect(result.current.isMaximized).toBe(false);
    });

    it('calls getWindowState on mount', async () => {
      mockGetWindowState.mockResolvedValue({ isMaximized: true });

      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isMaximized).toBe(true);
      expect(mockGetWindowState).toHaveBeenCalledTimes(1);
    });

    it('does not crash when getWindowState fails', async () => {
      mockGetWindowState.mockRejectedValue(new Error('fail'));

      const { result } = renderHook(() => useTitleBar());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
      expect(result.current.isMaximized).toBe(false);
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
      mockMaximize.mockResolvedValue({ isMaximized: true });

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
