// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ dialog: { showMessageBox: vi.fn() } }));
vi.mock('@/main/updater/AppUpdater', () => ({ AppUpdater: class {} }));

import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { bindMainWindow } from '@/main/window/bindMainWindow';
import { eventsContract } from '@/shared/ipc/contracts';

describe('bindMainWindow', () => {
  it.each([
    ['enter-full-screen', true],
    ['leave-full-screen', false],
  ])('sends a fullscreenChanged payload its event schema accepts on %s', (event, isFullscreen) => {
    const send = vi.fn();
    const window = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isFullScreen: () => isFullscreen,
      webContents: { send },
    });
    bindMainWindow(window as unknown as BrowserWindow, { register: vi.fn() } as unknown as IpcRouter);

    window.emit(event);

    expect(send).toHaveBeenCalledExactlyOnceWith(eventsContract.channels.fullscreenChanged, { isFullscreen });
    // The preload bridge drops payloads outside the event schema.
    expect(eventsContract.events.fullscreenChanged.schema.safeParse(send.mock.calls[0]![1]).success).toBe(true);
  });
});
