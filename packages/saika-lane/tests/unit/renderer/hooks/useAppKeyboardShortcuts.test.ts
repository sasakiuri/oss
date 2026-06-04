// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SHORTCUTS } from '@/renderer/presentation/constants/shortcuts';
import { useAppKeyboardShortcuts } from '@/renderer/presentation/hooks/useAppKeyboardShortcuts';

function fireKey(code: string, key?: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true }));
}

function fireKeyFrom(target: HTMLElement, code: string, key?: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: key ?? code, bubbles: true }));
}

describe('useAppKeyboardShortcuts', () => {
  let onPreparationClick: ReturnType<typeof vi.fn>;
  let onMatchClick: ReturnType<typeof vi.fn>;
  let onNextStageClick: ReturnType<typeof vi.fn>;
  let onPrint: ReturnType<typeof vi.fn>;
  let onToggleFullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPreparationClick = vi.fn().mockResolvedValue(undefined);
    onMatchClick = vi.fn().mockResolvedValue(undefined);
    onNextStageClick = vi.fn().mockResolvedValue(undefined);
    onPrint = vi.fn().mockResolvedValue(undefined);
    onToggleFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderShortcutHook() {
    return renderHook(() =>
      useAppKeyboardShortcuts({
        screen: 'main',
        onPreparationClick,
        onMatchClick,
        onNextStageClick,
        onPrint,
        onToggleFullscreen,
      }),
    );
  }

  it('calls main screen shortcuts from the window', () => {
    renderShortcutHook();

    fireKey(SHORTCUTS.PREPARATION);
    fireKey(SHORTCUTS.MATCH);
    fireKey(SHORTCUTS.NEXT_STAGE);
    fireKey(SHORTCUTS.PRINT);

    expect(onPreparationClick).toHaveBeenCalledTimes(1);
    expect(onMatchClick).toHaveBeenCalledTimes(1);
    expect(onNextStageClick).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('does not call main screen shortcuts from editable controls', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderShortcutHook();

    fireKeyFrom(input, SHORTCUTS.PREPARATION, '1');
    fireKeyFrom(input, SHORTCUTS.MATCH, '2');
    fireKeyFrom(input, SHORTCUTS.NEXT_STAGE, '3');
    fireKeyFrom(input, SHORTCUTS.PRINT, '9');

    expect(onPreparationClick).not.toHaveBeenCalled();
    expect(onMatchClick).not.toHaveBeenCalled();
    expect(onNextStageClick).not.toHaveBeenCalled();
    expect(onPrint).not.toHaveBeenCalled();

    input.remove();
  });

  it('still toggles fullscreen from editable controls', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    renderShortcutHook();

    fireKeyFrom(input, SHORTCUTS.FULLSCREEN, 'F11');

    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);

    input.remove();
  });
});
