// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { protectWindow } from '../src/main/protectWindow';

const PAGE_URL = 'file:///opt/saika-vista/resources/app.asar/dist/renderer/index.html?screen=screen-one';

function protectedContents(currentUrl = PAGE_URL) {
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
  it.each([
    'file:///etc/passwd',
    'file:///opt/saika-vista/resources/app.asar/dist/renderer/index.html?screen=screen-two',
    'file:///opt/saika-vista/resources/app.asar/dist/renderer/index.html',
    'https://example.test/',
    'http://localhost:5173/',
  ])('blocks navigation from the loaded page to %s', (url) => {
    expect(navigate(protectedContents(), url)).toBe(true);
  });

  it.each([PAGE_URL, 'http://localhost:5173/', 'http://localhost:5173/?screen=screen-one'])(
    'allows a reload of the page it shows (%s)',
    (url) => {
      expect(navigate(protectedContents(url), url)).toBe(false);
    },
  );

  it('blocks navigation before any page is shown', () => {
    expect(navigate(protectedContents(''), PAGE_URL)).toBe(true);
  });
});
