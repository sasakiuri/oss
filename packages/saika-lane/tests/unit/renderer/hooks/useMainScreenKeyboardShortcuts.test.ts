// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';
import { useMainScreenKeyboardShortcuts } from '@/renderer/presentation/hooks/useMainScreenKeyboardShortcuts';

function fireKey(code: string, key?: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true }));
}

describe('useMainScreenKeyboardShortcuts', () => {
  let setZoomMode: ReturnType<typeof vi.fn>;
  let setSettingsInitialTab: ReturnType<typeof vi.fn>;
  let setIsSettingsModalOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setZoomMode = vi.fn();
    setSettingsInitialTab = vi.fn();
    setIsSettingsModalOpen = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls zoom in on NumpadAdd', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey(SHORTCUTS.ZOOM_IN);
    expect(setZoomMode).toHaveBeenCalledTimes(1);
  });

  it('calls zoom out on NumpadSubtract', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey(SHORTCUTS.ZOOM_OUT);
    expect(setZoomMode).toHaveBeenCalledTimes(1);
  });

  it('sets auto zoom on Numpad5', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey(SHORTCUTS.AUTO_ZOOM);
    expect(setZoomMode).toHaveBeenCalledWith('AUTO');
  });

  it('toggles settings modal on NumpadDecimal', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey(SHORTCUTS.SETTINGS);
    expect(setSettingsInitialTab).toHaveBeenCalledWith('general');
    expect(setIsSettingsModalOpen).toHaveBeenCalledTimes(1);
  });

  it('closes settings modal on Escape when it is open', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: true,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey('Escape', 'Escape');
    expect(setIsSettingsModalOpen).toHaveBeenCalledWith(false);
  });

  it('does nothing on Escape when settings modal is closed', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey('Escape', 'Escape');
    expect(setIsSettingsModalOpen).not.toHaveBeenCalled();
  });
});
