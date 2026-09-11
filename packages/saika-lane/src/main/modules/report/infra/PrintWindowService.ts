// SPDX-License-Identifier: MIT
import { join } from 'path';

import { app, BrowserWindow } from 'electron';

import { DomainError } from '@/shared/errors/DomainError';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import { PrintSettingsSchema, type PrinterDto, type PrintSettingsDto } from '@/shared/ipc/contracts';

interface PrintJob {
  window: BrowserWindow;
  ready: () => void;
  fail: (error: Error) => void;
}

/** Owns preview windows and sends rendered score sheets to the saved printer. */
export class PrintWindowService {
  private printWindow: BrowserWindow | null = null;
  private job: PrintJob | null = null;

  constructor(
    private readonly preloadPath: string,
    private readonly rendererDir: string,
    private readonly getPrintSettings: () => PrintSettingsDto = () => PrintSettingsSchema.parse({}),
  ) {}

  async listPrinters(): Promise<PrinterDto[]> {
    const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!window) throw ErrorCatalog.createError('PRINTER_UNAVAILABLE');
    const printers = await window.webContents.getPrintersAsync();
    return printers.map(({ name, displayName }) => ({ name, displayName }));
  }

  markReady(senderId: number, error?: string): void {
    if (!this.job || this.job.window.webContents.id !== senderId) return;
    if (error !== undefined) {
      this.job.fail(ErrorCatalog.createError('PRINT_FAILED', { reason: error }));
    } else {
      this.job.ready();
    }
  }

  async open(sessionId: string): Promise<void> {
    if (this.job) throw ErrorCatalog.createError('PRINT_IN_PROGRESS');
    const settings = PrintSettingsSchema.parse(this.getPrintSettings());
    const direct = settings.deviceName !== '';

    if (this.printWindow && !this.printWindow.isDestroyed()) this.printWindow.close();
    const window = this.createWindow(direct);
    this.printWindow = window;
    window.on('closed', () => {
      if (this.printWindow === window) this.printWindow = null;
    });

    if (!direct) {
      try {
        await this.load(window, { sessionId });
      } catch (error) {
        if (!window.isDestroyed()) window.destroy();
        throw error;
      }
      return;
    }

    let ready!: () => void;
    let fail!: (error: Error) => void;
    const rendered = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const failed = new Promise<never>((_, reject) => {
      fail = reject;
    });
    const job: PrintJob = { window, ready, fail };
    this.job = job;
    const timeout = setTimeout(
      () =>
        fail(
          ErrorCatalog.createError('PRINT_FAILED', {
            reason: 'The print job timed out. Check the printer queue before trying again.',
          }),
        ),
      60_000,
    );
    window.on('closed', () => fail(ErrorCatalog.createError('PRINT_FAILED', { reason: 'The print window closed.' })));
    window.webContents.on('render-process-gone', () =>
      fail(
        ErrorCatalog.createError('PRINT_FAILED', {
          reason: 'The print renderer stopped.',
        }),
      ),
    );

    const print = async () => {
      await Promise.all([
        this.load(window, {
          sessionId,
          autoPrint: 'true',
          pageSize: settings.pageSize,
          landscape: String(settings.landscape),
        }),
        rendered,
      ]);
      if (this.job !== job) return;
      const printers = await window.webContents.getPrintersAsync();
      if (this.job !== job) return;
      if (!printers.some((printer) => printer.name === settings.deviceName)) {
        throw ErrorCatalog.createError('PRINTER_UNAVAILABLE');
      }
      await new Promise<void>((resolve, reject) => {
        window.webContents.print(
          {
            ...settings,
            silent: true,
            printBackground: true,
            margins: { marginType: 'custom', top: 38, bottom: 38, left: 38, right: 38 },
          },
          (success, reason) => {
            if (success) resolve();
            else
              reject(ErrorCatalog.createError('PRINT_FAILED', { reason: reason || 'The printer rejected the job.' }));
          },
        );
      });
    };

    try {
      await Promise.race([print(), failed]);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw ErrorCatalog.createError('PRINT_FAILED', {
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
      this.job = null;
      ready();
      if (!window.isDestroyed()) window.destroy();
    }
  }

  private createWindow(direct: boolean): BrowserWindow {
    const window = new BrowserWindow({
      width: 800,
      height: 1000,
      title: 'Score Sheet',
      show: !direct,
      webPreferences: {
        preload: this.preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    window.webContents.on('will-navigate', (event, url) => {
      const devServerUrl = process.env.VITE_DEV_SERVER_URL;
      const isDevUrl = !app.isPackaged && devServerUrl != null && new URL(url).origin === new URL(devServerUrl).origin;
      if (!url.startsWith('file://') && !isDevUrl) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    return window;
  }

  private async load(window: BrowserWindow, query: Record<string, string>): Promise<void> {
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      await window.loadURL(`${process.env.VITE_DEV_SERVER_URL}/print.html?${new URLSearchParams(query)}`);
    } else {
      await window.loadFile(join(this.rendererDir, 'print.html'), { query });
    }
  }
}
