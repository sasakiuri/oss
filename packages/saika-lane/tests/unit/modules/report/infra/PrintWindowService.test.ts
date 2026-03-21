// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';

// ---------- BrowserWindow mock ----------

const mockLoadURL = vi.fn().mockResolvedValue(undefined);
const mockLoadFile = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockOn = vi.fn();
const mockWebContentsOn = vi.fn();
const mockSetWindowOpenHandler = vi.fn();

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: mockLoadURL,
    loadFile: mockLoadFile,
    close: mockClose,
    isDestroyed: mockIsDestroyed,
    on: mockOn,
    webContents: {
      on: mockWebContentsOn,
      setWindowOpenHandler: mockSetWindowOpenHandler,
    },
  })),
}));

describe('PrintWindowService', () => {
  const preloadPath = '/path/to/preload.js';
  const rendererDir = '/path/to/renderer';

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VITE_DEV_SERVER_URL;
  });

  it('should load via VITE_DEV_SERVER_URL in development environment', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');

    expect(mockLoadURL).toHaveBeenCalledWith('http://localhost:5173/print.html?sessionId=session-001');
  });

  it('should load print.html file in production environment', async () => {
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');

    expect(mockLoadFile).toHaveBeenCalledWith(expect.stringContaining('print.html'), {
      query: { sessionId: 'session-001' },
    });
  });

  it('should close the existing window before opening a new one', async () => {
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');
    await service.open('session-002');

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('should not call close when the existing window is already destroyed', async () => {
    mockIsDestroyed.mockReturnValue(true);
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');
    await service.open('session-002');

    expect(mockClose).not.toHaveBeenCalled();
  });

  it('should URL-encode sessionId (development environment)', async () => {
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173';
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session with spaces');

    expect(mockLoadURL).toHaveBeenCalledWith(expect.stringContaining('sessionId=session%20with%20spaces'));
  });

  it('should register a closed event handler', async () => {
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');

    expect(mockOn).toHaveBeenCalledWith('closed', expect.any(Function));
  });
});
