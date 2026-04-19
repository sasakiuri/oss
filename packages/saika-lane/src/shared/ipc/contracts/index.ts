// SPDX-License-Identifier: MIT
/**
 * IPC Contract barrel exports
 *
 * @description
 * Re-exports all IPC contract definitions and their inferred types.
 */

export { sessionContract } from './session.contract';
export type {
  Discipline,
  GetSessionScoreInput,
  GetShotHistoryInput,
  RecordShotInput,
  ResetSessionInput,
  SessionMode,
  SessionScoreDto,
  ShotDto,
  ShotHistoryDto,
  StartSessionInput,
  StartSessionResponse,
  SwitchModeInput,
} from './session.contract';

export { connectionContract } from './connection.contract';
export type {
  ConnectInput,
  ConnectResponse,
  DisconnectInput,
  GetDevicesByManufacturerDto,
  GetDevicesByManufacturerInput,
  ListPortsDto,
  PortInfo,
  TargetDeviceDto,
  TargetManufacturer,
} from './connection.contract';

export {
  AppSettingsDraftSchema,
  AppSettingsSchema,
  ConnectionSettingsSchema,
  settingsContract,
} from './settings.contract';
export type {
  AppSettingsDraftDto,
  AppSettingsDto,
  ConnectionSettingsDto,
  SaveAppSettingsInput,
  SaveConnectionSettingsInput,
  SaveUserPreferencesInput,
  SettingsFileInfoDto,
  UserPreferencesDto,
} from './settings.contract';

export { competitionContract } from './competition.contract';
export type {
  CompetitionIdInput,
  CompetitionStateDto,
  CompetitionTypeDto,
  StartCompetitionInput,
  StartCompetitionResponse,
} from './competition.contract';

export { reportContract } from './report.contract';
export type { GetScoreSheetInput, OpenPrintWindowInput, ScoreSheetDto, ScoreSheetShotDto } from './report.contract';

export { eventsContract } from './events.contract';
export type {
  CompetitionFinishedEventPayload,
  CompetitionStartedEventPayload,
  ConnectionStatus,
  ConnectionStatusChangedEventPayload,
  IpcErrorEventPayload,
  LogEntryDto,
  LogMessageEventPayload,
  ModeSwitchedEventPayload,
  MqttStatusChangedEventPayload,
  PhaseChangedEventPayload,
  SeriesCompletedEventPayload,
  SessionResetEventPayload,
  SessionStartedEventPayload,
  ShotRecordedEventPayload,
  StageAdvancedEventPayload,
  TimerExpiredEventPayload,
  TimerTickEventPayload,
} from './events.contract';

export { windowContract } from './window.contract';
export type { FullscreenStateDto, ToggleFullscreenResponse, WindowStateDto } from './window.contract';

export { mqttContract } from './mqtt.contract';
export type { ConnectMqttInput, MqttSettings, MqttStatus } from './mqtt.contract';
