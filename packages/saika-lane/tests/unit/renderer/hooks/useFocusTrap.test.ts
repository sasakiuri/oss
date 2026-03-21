// SPDX-License-Identifier: MIT
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFocusTrap } from '@/renderer/presentation/hooks/useFocusTrap';

function createContainer(...buttonLabels: string[]): HTMLDivElement {
  const container = document.createElement('div');
  container.tabIndex = -1;
  for (const label of buttonLabels) {
    const btn = document.createElement('button');
    btn.textContent = label;
    container.appendChild(btn);
  }
  document.body.appendChild(container);
  return container;
}

describe('useFocusTrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('moves focus to the container when isActive=true', () => {
    const container = createContainer('A', 'B');
    const ref = { current: container };

    renderHook(() => useFocusTrap(true, ref));

    expect(document.activeElement).toBe(container);
  });

  it('does not move focus when isActive=false', () => {
    const container = createContainer('A');
    const ref = { current: container };

    renderHook(() => useFocusTrap(false, ref));

    expect(document.activeElement).not.toBe(container);
  });

  it('restores focus to the previous element when isActive changes to false', () => {
    const outer = document.createElement('button');
    outer.textContent = 'outer';
    document.body.appendChild(outer);
    outer.focus();

    const container = createContainer('A');
    const ref = { current: container };

    const { rerender } = renderHook(({ active }) => useFocusTrap(active, ref), { initialProps: { active: true } });

    expect(document.activeElement).toBe(container);

    rerender({ active: false });

    expect(document.activeElement).toBe(outer);
  });

  it('wraps focus from the last element to the first on Tab key', () => {
    const container = createContainer('first', 'last');
    const ref = { current: container };
    const buttons = container.querySelectorAll('button');

    renderHook(() => useFocusTrap(true, ref));

    // Set focus to the last element
    buttons[1]!.focus();
    expect(document.activeElement).toBe(buttons[1]);

    // Fire Tab key
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(buttons[0]);
  });

  it('wraps focus from the first element to the last on Shift+Tab key', () => {
    const container = createContainer('first', 'last');
    const ref = { current: container };
    const buttons = container.querySelectorAll('button');

    renderHook(() => useFocusTrap(true, ref));

    buttons[0]!.focus();
    expect(document.activeElement).toBe(buttons[0]);

    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.activeElement).toBe(buttons[1]);
  });

  it('does not change focus for non-Tab keys', () => {
    const container = createContainer('A', 'B');
    const ref = { current: container };
    const buttons = container.querySelectorAll('button');

    renderHook(() => useFocusTrap(true, ref));

    buttons[0]!.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).toBe(buttons[0]);
  });

  it('removes listener on unmount', () => {
    const container = createContainer('first', 'last');
    const ref = { current: container };
    const buttons = container.querySelectorAll('button');

    const { unmount } = renderHook(() => useFocusTrap(true, ref));
    unmount();

    const lastButton = buttons[1] as HTMLButtonElement;
    lastButton.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    // Listener removed, so focus does not wrap
    expect(document.activeElement).toBe(lastButton);
  });

  it('does nothing on Tab in a container with no focusable elements', () => {
    const container = document.createElement('div');
    container.tabIndex = -1;
    document.body.appendChild(container);
    const ref = { current: container };

    renderHook(() => useFocusTrap(true, ref));

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(container);
  });
});
