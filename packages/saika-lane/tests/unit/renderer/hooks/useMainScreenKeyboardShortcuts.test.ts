// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';
import { useMainScreenKeyboardShortcuts } from '@/renderer/presentation/hooks/useMainScreenKeyboardShortcuts';

function fireKey(code: string, key?: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true }));
}

function fireKeyFrom(target: HTMLElement, code: string, key?: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true }));
}

describe('useMainScreenKeyboardShortcuts', () => {
  let onZoomClick: ReturnType<typeof vi.fn>;
  let setZoomMode: ReturnType<typeof vi.fn>;
  let setSettingsInitialTab: ReturnType<typeof vi.fn>;
  let setIsSettingsModalOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onZoomClick = vi.fn();
    setZoomMode = vi.fn();
    setSettingsInitialTab = vi.fn();
    setIsSettingsModalOpen = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls the shared zoom handler on Numpad6', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        onZoomClick,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey(SHORTCUTS.ZOOM);
    expect(onZoomClick).toHaveBeenCalledTimes(1);
    expect(setZoomMode).not.toHaveBeenCalled();
  });

  it('does not call the shared zoom handler from editable controls', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        onZoomClick,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKeyFrom(input, SHORTCUTS.ZOOM, '6');
    expect(onZoomClick).not.toHaveBeenCalled();
    expect(setZoomMode).not.toHaveBeenCalled();

    input.remove();
  });

  it('does nothing on NumpadSubtract', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        onZoomClick,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey('NumpadSubtract');
    expect(onZoomClick).not.toHaveBeenCalled();
    expect(setZoomMode).not.toHaveBeenCalled();
  });

  it('does not handle main screen shortcuts from editable controls', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        onZoomClick,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKeyFrom(input, SHORTCUTS.AUTO_ZOOM, '5');
    fireKeyFrom(input, SHORTCUTS.SETTINGS, '.');

    expect(setZoomMode).not.toHaveBeenCalled();
    expect(setSettingsInitialTab).not.toHaveBeenCalled();
    expect(setIsSettingsModalOpen).not.toHaveBeenCalled();

    input.remove();
  });

  it('sets auto zoom on Numpad5', () => {
    renderHook(() =>
      useMainScreenKeyboardShortcuts({
        isSettingsModalOpen: false,
        onZoomClick,
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
        onZoomClick,
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
        onZoomClick,
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
        onZoomClick,
        setZoomMode,
        setSettingsInitialTab,
        setIsSettingsModalOpen,
      }),
    );

    fireKey('Escape', 'Escape');
    expect(setIsSettingsModalOpen).not.toHaveBeenCalled();
  });
});
