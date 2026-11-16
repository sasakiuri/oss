// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { protectWindow } from '@/main/shared-infra/window/protectWindow';

const PAGE_URL = 'file:///opt/saika-lane/resources/app.asar/dist/renderer/index.html';

function createProtectedWindow(currentUrl = PAGE_URL) {
  const webContents = Object.assign(new EventEmitter(), {
    getURL: vi.fn(() => currentUrl),
    setWindowOpenHandler: vi.fn(),
    session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
  });
  protectWindow({ webContents } as unknown as BrowserWindow);
  return webContents;
}

function navigate(webContents: EventEmitter, url: string): boolean {
  const details = { url, preventDefault: vi.fn() };
  webContents.emit('will-navigate', details, url);
  return details.preventDefault.mock.calls.length > 0;
}

describe('protectWindow', () => {
  it('denies every new window', () => {
    const webContents = createProtectedWindow();
    const handler = webContents.setWindowOpenHandler.mock.calls[0]![0] as (details: { url: string }) => unknown;

    expect(handler({ url: 'https://example.test/' })).toEqual({ action: 'deny' });
    expect(handler({ url: PAGE_URL })).toEqual({ action: 'deny' });
  });

  it.each([
    'file:///etc/passwd',
    'file:///opt/saika-lane/resources/app.asar/dist/renderer/print.html',
    'https://example.test/',
    'http://localhost:5173/',
  ])('blocks navigation from the loaded page to %s', (url) => {
    expect(navigate(createProtectedWindow(), url)).toBe(true);
  });

  it.each([PAGE_URL, 'http://localhost:5173/', 'file:///renderer/print.html?sessionId=session-1&autoPrint=true'])(
    'allows a reload of the page it shows (%s)',
    (url) => {
      expect(navigate(createProtectedWindow(url), url)).toBe(false);
    },
  );

  it('blocks navigation before any page is shown', () => {
    expect(navigate(createProtectedWindow(''), PAGE_URL)).toBe(true);
  });

  it('blocks webviews', () => {
    const webContents = createProtectedWindow();
    const event = { preventDefault: vi.fn() };

    webContents.emit('will-attach-webview', event, {}, {});

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('denies permission requests and checks', () => {
    const { session } = createProtectedWindow();
    const request = session.setPermissionRequestHandler.mock.calls[0]![0] as (
      contents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
    ) => void;
    const check = session.setPermissionCheckHandler.mock.calls[0]![0] as (
      contents: unknown,
      permission: string,
    ) => boolean;
    const callback = vi.fn();

    request({}, 'media', callback);

    expect(callback).toHaveBeenCalledExactlyOnceWith(false);
    expect(check({}, 'clipboard-read')).toBe(false);
  });
});
