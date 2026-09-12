// SPDX-License-Identifier: MIT
/** Renderer bridge types inferred from the shared IPC contracts. */

import type {
  competitionContract,
  connectionContract,
  AppUpdateStateDto,
  AppSettingsInputDto,
  ConnectionSettingsDto,
  eventsContract,
  mqttContract,
  reportContract,
  sessionContract,
  settingsContract,
  timedTargetContract,
  updaterContract,
  UserPreferencesDto,
  windowContract,
  vistaContract,
} from '@/shared/ipc/contracts';
import type { InferBridge, InferEventBridge, InferOutput } from '@/shared/ipc/defineContract';

// ---------------------------------------------------------------------------
// Bridge types inferred from contracts
// ---------------------------------------------------------------------------

type SessionBridge = InferBridge<typeof sessionContract>;
type ConnectionBridge = InferBridge<typeof connectionContract>;
type CompetitionBridge = InferBridge<typeof competitionContract>;
type SettingsBridge = InferBridge<typeof settingsContract>;
type EventBridge = InferEventBridge<typeof eventsContract>;
type ReportBridge = InferBridge<typeof reportContract>;
type WindowBridge = InferBridge<typeof windowContract>;
type MqttBridge = InferBridge<typeof mqttContract>;
type UpdaterBridge = InferBridge<typeof updaterContract>;
type TimedTargetBridge = InferBridge<typeof timedTargetContract>;

// ---------------------------------------------------------------------------
// Settings output types (used for adapted signatures)
// ---------------------------------------------------------------------------

type SaveConnectionSettingsOutput = InferOutput<(typeof settingsContract)['procedures']['saveConnectionSettings']>;
type SaveUserPreferencesOutput = InferOutput<(typeof settingsContract)['procedures']['saveUserPreferences']>;
type SaveAppSettingsOutput = InferOutput<(typeof settingsContract)['procedures']['saveAppSettings']>;

// ---------------------------------------------------------------------------
// ElectronAPI interface
// ---------------------------------------------------------------------------

/**
 * Electron API interface exposed to Renderer Process
 */
export interface ElectronAPI {
  /** Current platform information */
  readonly platform: NodeJS.Platform;
  /** Whether the current window uses native OS chrome */
  readonly hasNativeWindowFrame: boolean;

  /** Application version from package.json */
  readonly appVersion: string;

  /** Command execution methods */
  readonly commands: Pick<SessionBridge, 'startSession' | 'recordShot' | 'switchMode' | 'resetSession'>;

  /** USB device management methods */
  readonly usb: ConnectionBridge;

  /** Data query methods */
  readonly queries: Pick<SessionBridge, 'getSessionScore' | 'getShotHistory'>;

  /** Competition management methods */
  readonly competition: CompetitionBridge;

  /**
   * Settings management methods
   *
   * These use adapted signatures because buildPreloadAPI wraps
   * raw settings/preferences into the contract input format.
   */
  readonly settings: {
    savePrintSettings: SettingsBridge['savePrintSettings'];
    /** Save connection settings */
    saveConnectionSettings: (settings: ConnectionSettingsDto) => Promise<SaveConnectionSettingsOutput>;
    /** Get saved connection settings */
    getConnectionSettings: SettingsBridge['getConnectionSettings'];
    /** Save user preferences */
    saveUserPreferences: (preferences: UserPreferencesDto) => Promise<SaveUserPreferencesOutput>;
    /** Get saved user preferences */
    getUserPreferences: SettingsBridge['getUserPreferences'];
    /** Save the full settings document */
    saveAppSettings: (settings: AppSettingsInputDto) => Promise<SaveAppSettingsOutput>;
    /** Get the full settings document */
    getAppSettings: SettingsBridge['getAppSettings'];
    /** Get settings file metadata */
    getSettingsFileInfo: SettingsBridge['getSettingsFileInfo'];
  };

  /** Report/print methods */
  readonly report: ReportBridge;

  /** Window operation methods */
  readonly window: WindowBridge;

  /** MQTT management methods */
  readonly mqtt: MqttBridge;

  /** Independent ISSF 25m timed-target sequence state and local emergency cancellation. */
  readonly timedTarget: TimedTargetBridge;
  readonly vista: InferBridge<typeof vistaContract>;

  /** Application update methods */
  readonly updates: {
    getUpdateState: UpdaterBridge['getUpdateState'];
    checkForUpdates: UpdaterBridge['checkForUpdates'];
    quitAndInstall: UpdaterBridge['quitAndInstall'];
  };

  /** Event subscription methods */
  readonly on: EventBridge & {
    updateStateChanged: (callback: (data: AppUpdateStateDto) => void) => () => void;
  };
}

// ---------------------------------------------------------------------------
// Global Window interface extension
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Electron API exposed via preload script */
    electronAPI: ElectronAPI;
  }
}
