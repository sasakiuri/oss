// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { hardenBrowserWindow } from '@/main/infrastructure/window/hardenBrowserWindow';

describe('hardenBrowserWindow', () => {
  it('denies new windows and navigation away from the loaded document', () => {
    let navigationHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    const preventDefault = vi.fn();
    const window = {
      webContents: {
        getURL: vi.fn(() => 'file:///app/index.html'),
        setWindowOpenHandler: vi.fn(),
        on: vi.fn((event: string, handler: typeof navigationHandler) => {
          if (event === 'will-navigate') navigationHandler = handler;
        }),
      },
    };

    hardenBrowserWindow(window as never);

    const openHandler = window.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as () => unknown;
    expect(openHandler()).toEqual({ action: 'deny' });
    navigationHandler?.({ preventDefault }, 'https://example.com/');
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('allows the initial load and a reload of the same URL', () => {
    let currentUrl = '';
    let navigationHandler: ((event: { preventDefault(): void }, url: string) => void) | undefined;
    const preventDefault = vi.fn();
    const window = {
      webContents: {
        getURL: vi.fn(() => currentUrl),
        setWindowOpenHandler: vi.fn(),
        on: vi.fn((_event: string, handler: typeof navigationHandler) => {
          navigationHandler = handler;
        }),
      },
    };

    hardenBrowserWindow(window as never);
    navigationHandler?.({ preventDefault }, 'file:///app/index.html');
    currentUrl = 'file:///app/index.html';
    navigationHandler?.({ preventDefault }, currentUrl);

    expect(preventDefault).not.toHaveBeenCalled();
  });
});
