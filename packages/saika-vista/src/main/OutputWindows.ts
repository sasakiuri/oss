// SPDX-License-Identifier: MIT
import { BrowserWindow, powerSaveBlocker, screen, type WebContents } from 'electron';

import type { ScreenConfig } from '../shared/model';

import { isolatedWebPreferences, protectWindow } from './protectWindow';

type Output = { window: BrowserWindow; revision: number | null; renderedAt: number };

/** One full-screen audience window per screen, and the display-sleep block held while any is open. */
export class OutputWindows {
  private readonly outputs = new Map<string, Output>();
  private powerBlock: number | null = null;

  constructor(
    private readonly options: {
      icon: string;
      preload: string;
      /** Loads the audience renderer for a screen and reports a load failure. */
      load(window: BrowserWindow, screenId: string): void;
      /** Runs after an audience window has closed. */
      closed(): void;
    },
  ) {}

  open(config: ScreenConfig): void {
    const display = screen.getAllDisplays().find((monitor) => String(monitor.id) === config.monitorId);
    if (!display) throw new Error('The saved monitor is not connected. Select the replacement monitor explicitly.');
    const existing = this.outputs.get(config.id);
    if (existing) {
      existing.window.setBounds(display.bounds);
      existing.window.setFullScreen(true);
      existing.window.showInactive();
      if (existing.window.webContents.isCrashed()) this.options.load(existing.window, config.id);
      else existing.window.webContents.send('vista:changed');
      return;
    }
    const window = new BrowserWindow({
      ...display.bounds,
      title: config.name,
      icon: this.options.icon,
      backgroundColor: '#10191d',
      frame: false,
      fullscreen: true,
      autoHideMenuBar: true,
      show: false,
      webPreferences: { ...isolatedWebPreferences(this.options.preload), backgroundThrottling: false },
    });
    protectWindow(window);
    this.outputs.set(config.id, { window, revision: null, renderedAt: 0 });
    window.on('ready-to-show', () => window.showInactive());
    window.on('closed', () => {
      this.outputs.delete(config.id);
      this.maintainPower();
      this.options.closed();
    });
    window.webContents.on('render-process-gone', () => {
      const output = this.outputs.get(config.id);
      if (output) {
        output.revision = null;
        output.renderedAt = 0;
      }
    });
    window.webContents.on('unresponsive', () => {
      const output = this.outputs.get(config.id);
      if (output) output.renderedAt = 0;
    });
    this.options.load(window, config.id);
    this.maintainPower();
  }

  close(id: string): void {
    this.outputs.get(id)?.window.close();
  }

  has(id: string): boolean {
    return this.outputs.has(id);
  }

  /** The last confirmed revision, and whether the window confirmed rendering within four seconds. */
  status(id: string): { revision: number | null; alive: boolean } {
    const output = this.outputs.get(id);
    return { revision: output?.revision ?? null, alive: !!output && Date.now() - output.renderedAt < 4000 };
  }

  /** The screen shown by the audience window that owns these web contents. */
  screenOf(contents: WebContents): string | undefined {
    return [...this.outputs.entries()].find(([, output]) => output.window.webContents === contents)?.[0];
  }

  rendered(id: string, revision: number): void {
    const output = this.outputs.get(id);
    if (!output) return;
    output.revision = revision;
    output.renderedAt = Date.now();
  }

  /** Asks every open audience window to reload its state. */
  notify(): void {
    for (const output of this.outputs.values())
      if (!output.window.isDestroyed()) output.window.webContents.send('vista:changed');
  }

  private maintainPower(): void {
    if (this.outputs.size && this.powerBlock === null)
      this.powerBlock = powerSaveBlocker.start('prevent-display-sleep');
    else if (!this.outputs.size && this.powerBlock !== null) {
      powerSaveBlocker.stop(this.powerBlock);
      this.powerBlock = null;
    }
  }
}
