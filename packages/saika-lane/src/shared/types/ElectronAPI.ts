// SPDX-License-Identifier: MIT
/**
 * Electron API type definitions
 *
 * @description
 * Defines the complete type-safe API exposed to the Renderer Process
 * via the preload script. Types are derived from IPC contracts using
 * InferBridge and InferEventBridge utility types.
 *
 * @example
 * ```typescript
 * // In Renderer Process
 * const result = await window.electronAPI.commands.startSession({
 *   discipline: 'AIR_RIFLE_10M'
 * });
 *
 * if (result.success) {
 *   console.log('Session started:', result.data.sessionId);
 * }
 *
 * // Subscribe to events
 * const unsubscribe = window.electronAPI.on.shotRecorded((event) => {
 *   console.log('Shot recorded:', event.shot);
 * });
 *
 * // Cleanup on unmount
 * unsubscribe();
 * ```
 */

import type {
  competitionContract,
  connectionContract,
  AppSettingsDto,
  ConnectionSettingsDto,
  eventsContract,
  mqttContract,
  reportContract,
  sessionContract,
  settingsContract,
  UserPreferencesDto,
  windowContract,
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
    /** Save connection settings */
    saveConnectionSettings: (settings: ConnectionSettingsDto) => Promise<SaveConnectionSettingsOutput>;
    /** Get saved connection settings */
    getConnectionSettings: SettingsBridge['getConnectionSettings'];
    /** Save user preferences */
    saveUserPreferences: (preferences: UserPreferencesDto) => Promise<SaveUserPreferencesOutput>;
    /** Get saved user preferences */
    getUserPreferences: SettingsBridge['getUserPreferences'];
    /** Save the full settings document */
    saveAppSettings: (settings: AppSettingsDto) => Promise<SaveAppSettingsOutput>;
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

  /** Event subscription methods */
  readonly on: EventBridge;
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
