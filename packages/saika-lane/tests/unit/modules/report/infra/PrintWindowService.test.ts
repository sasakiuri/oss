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
const mockGetURL = vi.fn().mockReturnValue('');
const mockSession = { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() };

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn().mockImplementation(function () {
    return {
      loadURL: mockLoadURL,
      loadFile: mockLoadFile,
      close: mockClose,
      isDestroyed: mockIsDestroyed,
      on: mockOn,
      webContents: {
        on: mockWebContentsOn,
        setWindowOpenHandler: mockSetWindowOpenHandler,
        getURL: mockGetURL,
        session: mockSession,
      },
    };
  }),
}));

describe('PrintWindowService', () => {
  const preloadPath = '/path/to/preload.js';
  const rendererDir = '/path/to/renderer';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
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

    expect(mockLoadURL).toHaveBeenCalledWith(expect.stringContaining('sessionId=session+with+spaces'));
  });

  it('keeps the print window on its score sheet page while it can still reload that page', async () => {
    const pageUrl = 'file:///path/to/renderer/print.html?sessionId=session-001';
    mockGetURL.mockReturnValue(pageUrl);
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');

    const handler = mockWebContentsOn.mock.calls.find(([event]) => event === 'will-navigate')?.[1] as (details: {
      url: string;
      preventDefault: () => void;
    }) => void;
    const navigate = (url: string) => {
      const details = { url, preventDefault: vi.fn() };
      handler(details);
      return details.preventDefault.mock.calls.length > 0;
    };
    expect(navigate('file:///path/to/renderer/index.html')).toBe(true);
    expect(navigate('file:///etc/passwd')).toBe(true);
    expect(navigate(pageUrl)).toBe(false);
    expect(mockWebContentsOn).toHaveBeenCalledWith('will-attach-webview', expect.any(Function));
    expect(mockSession.setPermissionRequestHandler).toHaveBeenCalledOnce();
    expect(mockSession.setPermissionCheckHandler).toHaveBeenCalledOnce();
    expect(mockSetWindowOpenHandler).toHaveBeenCalledOnce();
  });

  it('should register a closed event handler', async () => {
    const service = new PrintWindowService(preloadPath, rendererDir);

    await service.open('session-001');

    expect(mockOn).toHaveBeenCalledWith('closed', expect.any(Function));
  });
});
