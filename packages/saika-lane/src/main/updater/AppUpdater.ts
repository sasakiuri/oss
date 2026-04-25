// SPDX-License-Identifier: MIT
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow } from 'electron';

import { getLogger } from '@/main/shared-infra/logging';
import { eventsContract, type AppUpdateStateDto } from '@/shared/ipc/contracts';

interface UpdateInfoLike {
  version: string;
  releaseName?: string | null;
  releaseDate?: string | Date | null;
  releaseNotes?: unknown;
}

interface ProgressInfoLike {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  on(event: 'checking-for-update', listener: () => void): this;
  on(event: 'update-available', listener: (info: UpdateInfoLike) => void): this;
  on(event: 'update-not-available', listener: (info: UpdateInfoLike) => void): this;
  on(event: 'download-progress', listener: (progress: ProgressInfoLike) => void): this;
  on(event: 'update-downloaded', listener: (info: UpdateInfoLike) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

type AutoUpdaterModuleLoader = () => Promise<{ autoUpdater: AutoUpdaterLike }>;

export interface AppUpdaterOptions {
  mainWindow: BrowserWindow;
  onBeforeQuitForInstall?: () => void;
  isPackaged?: boolean;
  currentVersion?: string;
  loadAutoUpdater?: AutoUpdaterModuleLoader;
}

const DEFAULT_UNSUPPORTED_MESSAGE = 'Auto-update is available only in packaged releases.';

function createInitialState(currentVersion: string, isPackaged: boolean): AppUpdateStateDto {
  return {
    status: isPackaged ? 'idle' : 'unsupported',
    currentVersion,
    targetVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotes: null,
    downloadPercent: null,
    transferredBytes: null,
    totalBytes: null,
    bytesPerSecond: null,
    lastCheckedAt: null,
    errorMessage: isPackaged ? null : DEFAULT_UNSUPPORTED_MESSAGE,
    canCheckForUpdates: isPackaged,
    canInstallUpdate: false,
  };
}

function isPrereleaseVersion(version: string): boolean {
  return version.includes('-');
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  return null;
}

function normalizeReleaseNotes(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const notes = value
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }

      if (typeof entry !== 'object' || entry === null) {
        return '';
      }

      const note = 'note' in entry && typeof entry.note === 'string' ? entry.note.trim() : '';
      const version = 'version' in entry && typeof entry.version === 'string' ? entry.version.trim() : '';

      if (!note) {
        return '';
      }

      return version ? `${version}\n${note}` : note;
    })
    .filter((entry) => entry.length > 0);

  return notes.length > 0 ? notes.join('\n\n') : null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }

  return 'Unknown updater error';
}

export class AppUpdater {
  private readonly mainWindow: BrowserWindow;
  private readonly onBeforeQuitForInstall?: () => void;
  private readonly isPackaged: boolean;
  private readonly loadAutoUpdater: AutoUpdaterModuleLoader;
  private readonly currentVersion: string;

  private state: AppUpdateStateDto;
  private autoUpdater: AutoUpdaterLike | null = null;
  private initializePromise: Promise<void> | null = null;
  private checkPromise: Promise<AppUpdateStateDto> | null = null;
  private eventHandlersAttached = false;
  private readonly handleBeforeQuitForUpdate = () => {
    this.onBeforeQuitForInstall?.();
  };

  constructor(options: AppUpdaterOptions) {
    this.mainWindow = options.mainWindow;
    this.onBeforeQuitForInstall = options.onBeforeQuitForInstall;
    this.isPackaged = options.isPackaged ?? app.isPackaged;
    this.currentVersion = options.currentVersion ?? (typeof app.getVersion === 'function' ? app.getVersion() : '0.0.0');
    this.loadAutoUpdater =
      options.loadAutoUpdater ??
      (async () => {
        return (await import('electron-updater')) as { autoUpdater: AutoUpdaterLike };
      });
    this.state = createInitialState(this.currentVersion, this.isPackaged);
  }

  getState(): AppUpdateStateDto {
    return this.state;
  }

  emitCurrentState(): void {
    this.emitState();
  }

  async checkForUpdates(): Promise<AppUpdateStateDto> {
    if (!this.isPackaged) {
      this.emitState();
      return this.state;
    }

    if (this.state.canInstallUpdate) {
      return this.state;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    if (this.state.status === 'checking' || this.state.status === 'downloading') {
      return this.state;
    }

    this.checkPromise = (async () => {
      await this.ensureInitialized();

      if (!this.autoUpdater) {
        return this.state;
      }

      this.setState({
        ...this.state,
        status: 'checking',
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
        downloadPercent: null,
        transferredBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
      });

      try {
        await this.autoUpdater.checkForUpdates();
      } catch (error) {
        this.handleError(error);
      }

      return this.state;
    })();

    try {
      return await this.checkPromise;
    } finally {
      this.checkPromise = null;
    }
  }

  async quitAndInstall(): Promise<void> {
    if (!this.autoUpdater || !this.state.canInstallUpdate) {
      throw new Error('No downloaded update is ready to install.');
    }

    this.autoUpdater.quitAndInstall(false, true);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isPackaged) {
      return;
    }

    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = (async () => {
      try {
        const { autoUpdater } = await this.loadAutoUpdater();
        this.autoUpdater = autoUpdater;
        this.autoUpdater.autoDownload = true;
        this.autoUpdater.autoInstallOnAppQuit = true;
        this.autoUpdater.allowDowngrade = false;
        this.autoUpdater.allowPrerelease = isPrereleaseVersion(this.currentVersion);
        this.attachEventHandlers();
      } catch (error) {
        this.handleError(error);
      } finally {
        if (!this.autoUpdater) {
          this.initializePromise = null;
        }
      }
    })();

    return this.initializePromise;
  }

  private attachEventHandlers(): void {
    if (!this.autoUpdater || this.eventHandlersAttached) {
      return;
    }

    this.eventHandlersAttached = true;
    nativeAutoUpdater.on('before-quit-for-update', this.handleBeforeQuitForUpdate);

    this.autoUpdater.on('checking-for-update', () => {
      getLogger().info('Updater: checking for updates.', 'main');
      this.setState({
        ...this.state,
        status: 'checking',
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
      });
    });

    this.autoUpdater.on('update-available', (info) => {
      getLogger().info(`Updater: update available (${info.version}).`, 'main');
      this.setState({
        ...this.state,
        status: 'available',
        targetVersion: info.version,
        releaseName: info.releaseName ?? null,
        releaseDate: toIsoString(info.releaseDate),
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        downloadPercent: null,
        transferredBytes: null,
        totalBytes: null,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
      });
    });

    this.autoUpdater.on('update-not-available', () => {
      getLogger().info('Updater: application is up to date.', 'main');
      this.setState({
        ...createInitialState(this.currentVersion, true),
        status: 'no-update',
        lastCheckedAt: new Date().toISOString(),
      });
    });

    this.autoUpdater.on('download-progress', (progress) => {
      this.setState({
        ...this.state,
        status: 'downloading',
        downloadPercent: progress.percent,
        transferredBytes: progress.transferred,
        totalBytes: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: false,
      });
    });

    this.autoUpdater.on('update-downloaded', (info) => {
      getLogger().info(`Updater: update downloaded (${info.version}).`, 'main');
      this.setState({
        ...this.state,
        status: 'downloaded',
        targetVersion: info.version,
        releaseName: info.releaseName ?? this.state.releaseName,
        releaseDate: toIsoString(info.releaseDate) ?? this.state.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? this.state.releaseNotes,
        downloadPercent: 100,
        transferredBytes: this.state.totalBytes ?? this.state.transferredBytes,
        totalBytes: this.state.totalBytes,
        bytesPerSecond: this.state.bytesPerSecond,
        lastCheckedAt: new Date().toISOString(),
        errorMessage: null,
        canCheckForUpdates: false,
        canInstallUpdate: true,
      });
    });

    this.autoUpdater.on('error', (error) => {
      this.handleError(error);
    });
  }

  private handleError(error: unknown): void {
    const message = toErrorMessage(error);
    const canRetryInstall = this.state.canInstallUpdate;
    getLogger().warn('Updater: failed to complete update operation.', 'main', {
      error: message,
    });

    this.setState({
      ...this.state,
      status: 'error',
      downloadPercent: null,
      transferredBytes: null,
      totalBytes: null,
      bytesPerSecond: null,
      lastCheckedAt: new Date().toISOString(),
      errorMessage: message,
      canCheckForUpdates: this.isPackaged && !canRetryInstall,
      canInstallUpdate: canRetryInstall,
    });
  }

  private setState(nextState: AppUpdateStateDto): void {
    this.state = nextState;
    this.emitState();
  }

  private emitState(): void {
    if (this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(
      eventsContract?.channels?.updateStateChanged ?? 'event:updateStateChanged',
      this.state,
    );
  }
}
