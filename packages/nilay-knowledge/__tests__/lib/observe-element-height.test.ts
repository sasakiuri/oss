import { afterEach, expect, it, vi } from 'vitest';

import { observeElementHeight } from '@/lib/observe-element-height';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style');
});

it('retains CSS defaults, updates for reflow, and ignores a hidden mobile control', () => {
  let notify!: ResizeObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const root = document.documentElement;
  root.style.fontSize = '16px';
  const styles = document.createElement('style');
  styles.textContent = ':root { --site-header-height: 3.5rem; }';
  document.head.append(styles);
  const setHeight = (blockSize: number) => {
    notify([{ borderBoxSize: [{ blockSize }] } as ResizeObserverEntry], {} as ResizeObserver);
  };
  const stop = observeElementHeight(document.createElement('header'), '--site-header-height');
  try {
    setHeight(56);
    expect(root.style.getPropertyValue('--site-header-height')).toBe('');
    setHeight(88);
    expect(root.style.getPropertyValue('--site-header-height')).toBe('88px');
    setHeight(0);
    expect(root.style.getPropertyValue('--site-header-height')).toBe('88px');
    setHeight(56);
    expect(root.style.getPropertyValue('--site-header-height')).toBe('56px');
    stop();
    expect(root.style.getPropertyValue('--site-header-height')).toBe('');
    root.style.fontSize = '32px';
    const stopEnlarged = observeElementHeight(document.createElement('header'), '--site-header-height');
    setHeight(112);
    expect(root.style.getPropertyValue('--site-header-height')).toBe('');
    stopEnlarged();
    expect(disconnect).toHaveBeenCalledTimes(2);
  } finally {
    styles.remove();
  }
});
