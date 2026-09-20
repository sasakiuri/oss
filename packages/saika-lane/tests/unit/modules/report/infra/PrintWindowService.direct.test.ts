// SPDX-License-Identifier: MIT
import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import { PrintSettingsSchema } from '@/shared/ipc/contracts';

const mock = vi.hoisted(() => ({ windows: [] as unknown[], create: vi.fn() }));
vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: Object.assign(
    vi.fn(function (options) {
      return mock.create(options);
    }),
    { getAllWindows: () => mock.windows },
  ),
}));

class TestWindow extends EventEmitter {
  destroyed = false;
  webContents = Object.assign(new EventEmitter(), {
    id: 42,
    getPrintersAsync: vi.fn().mockResolvedValue([{ name: 'queue-1', displayName: 'Office printer' }]),
    setWindowOpenHandler: vi.fn(),
    print: vi.fn((_options: unknown, callback: (success: boolean, reason: string) => void) => callback(true, '')),
  });
  loadFile = vi.fn().mockResolvedValue(undefined);
  isDestroyed = () => this.destroyed;
  destroy = vi.fn(() => {
    this.destroyed = true;
    this.emit('closed');
  });
  close = this.destroy;
}

describe('direct score sheet printing', () => {
  let window: TestWindow;
  const settings = PrintSettingsSchema.parse({
    deviceName: 'queue-1',
    pageSize: 'Letter',
    landscape: true,
    copies: 2,
    color: true,
    duplexMode: 'longEdge',
  });
  let service: PrintWindowService;

  beforeEach(() => {
    vi.clearAllMocks();
    window = new TestWindow();
    mock.windows = [window];
    mock.create.mockReturnValue(window);
    service = new PrintWindowService('/preload.js', '/renderer', () => settings);
  });
  afterEach(() => vi.useRealTimers());

  it('waits for the owning renderer, passes saved options and closes only after submission', async () => {
    let submitted!: (success: boolean, reason: string) => void;
    window.webContents.print.mockImplementation((_options, callback) => {
      submitted = callback;
    });
    const result = service.open('session-1');
    service.markReady(999);
    await Promise.resolve();
    expect(window.webContents.print).not.toHaveBeenCalled();
    service.markReady(42);
    service.markReady(42);
    await vi.waitFor(() => expect(window.webContents.print).toHaveBeenCalledTimes(1));
    expect(mock.create).toHaveBeenCalledWith(expect.objectContaining({ show: false }));
    expect(window.webContents.print).toHaveBeenCalledWith(
      expect.objectContaining({ ...settings, silent: true, printBackground: true }),
      expect.any(Function),
    );
    expect(window.destroy).not.toHaveBeenCalled();
    submitted(true, '');
    await result;
    expect(window.destroy).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to another printer when the saved queue is missing', async () => {
    window.webContents.getPrintersAsync.mockResolvedValue([{ name: 'other', displayName: 'Other printer' }]);
    const result = service.open('session-1');
    service.markReady(42);
    await expect(result).rejects.toMatchObject({ code: 'PRINTER_UNAVAILABLE' });
    expect(window.webContents.print).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
  });

  it('reports renderer data errors without submitting an empty sheet', async () => {
    const result = service.open('session-1');
    service.markReady(42, 'Score sheet unavailable');
    await expect(result).rejects.toMatchObject({
      code: 'PRINT_FAILED',
      message: 'Printing failed: Score sheet unavailable',
    });
    expect(window.webContents.print).not.toHaveBeenCalled();
  });

  it('reports driver rejection and releases the window', async () => {
    window.webContents.print.mockImplementation((_options, callback) => callback(false, 'Printer offline'));
    const result = service.open('session-1');
    service.markReady(42);
    await expect(result).rejects.toMatchObject({ code: 'PRINT_FAILED', message: 'Printing failed: Printer offline' });
    expect(window.destroy).toHaveBeenCalled();
  });

  it('rejects overlapping requests without closing the active print window', async () => {
    const result = service.open('session-1');
    await expect(service.open('session-2')).rejects.toMatchObject({ code: 'PRINT_IN_PROGRESS' });
    expect(window.destroy).not.toHaveBeenCalled();
    service.markReady(42);
    await result;
    expect(window.webContents.print).toHaveBeenCalledTimes(1);
  });

  it('times out if rendering never completes and permits the next request', async () => {
    vi.useFakeTimers();
    await Promise.all([
      expect(service.open('session-1')).rejects.toMatchObject({ code: 'PRINT_FAILED' }),
      vi.advanceTimersByTimeAsync(60_000),
    ]);
    service.markReady(42);
    expect(window.webContents.print).not.toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
    window = new TestWindow();
    mock.create.mockReturnValue(window);
    const next = service.open('session-2');
    service.markReady(42);
    await next;
    expect(window.webContents.print).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled driver callback', async () => {
    vi.useFakeTimers();
    window.webContents.print.mockImplementation(() => {});
    const result = service.open('session-1');
    service.markReady(42);
    await Promise.all([
      expect(result).rejects.toMatchObject({ code: 'PRINT_FAILED' }),
      vi.advanceTimersByTimeAsync(60_000),
    ]);
    expect(window.webContents.print).toHaveBeenCalledTimes(1);
    expect(window.destroy).toHaveBeenCalled();
  });

  it('cleans up failed loads and renderer crashes', async () => {
    window.loadFile.mockRejectedValueOnce(new Error('Load failed'));
    await expect(service.open('session-1')).rejects.toMatchObject({ code: 'PRINT_FAILED' });
    window = new TestWindow();
    mock.create.mockReturnValue(window);
    const result = service.open('session-2');
    window.webContents.emit('render-process-gone');
    await expect(result).rejects.toMatchObject({ code: 'PRINT_FAILED' });
    expect(window.webContents.print).not.toHaveBeenCalled();
  });

  it('lists system names separately from display names', async () => {
    await expect(service.listPrinters()).resolves.toEqual([{ name: 'queue-1', displayName: 'Office printer' }]);
  });
});
