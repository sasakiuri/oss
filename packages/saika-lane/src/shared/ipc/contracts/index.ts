// SPDX-License-Identifier: MIT
/**
 * IPC Contract barrel exports
 *
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
  AppSettingsInputSchema,
  AppSettingsSchema,
  ConnectionSettingsSchema,
  PrintSettingsSchema,
  settingsContract,
} from './settings.contract';
export type {
  AppSettingsDraftDto,
  AppSettingsInputDto,
  AppSettingsDto,
  ConnectionSettingsDto,
  PrintSettingsDto,
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
export type {
  GetScoreSheetInput,
  OpenPrintWindowInput,
  PrinterDto,
  ScoreSheetDto,
  ScoreSheetShotDto,
} from './report.contract';

export { eventsContract } from './events.contract';
export type {
  CompetitionFinishedEventPayload,
  CompetitionCueChangedEventPayload,
  CompetitionStartedEventPayload,
  ConnectionStatus,
  ConnectionStatusChangedEventPayload,
  FullscreenChangedEventPayload,
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
  TimedTargetSequenceChangedEventPayload,
  SafetyStopChangedEventPayload,
} from './events.contract';

export { windowContract } from './window.contract';
export type { FullscreenStateDto, ToggleFullscreenResponse, WindowStateDto } from './window.contract';

export { mqttContract } from './mqtt.contract';
export type {
  ClearEstComplaintSignalInput,
  ClearQualificationMalfunctionSignalInput,
  ClearRangeOfficerRequestInput,
  ConnectMqttInput,
  DeclareEstComplaintInput,
  DeclareQualificationMalfunctionInput,
  EstComplaintContextDto,
  EstComplaintSignalDto,
  LaneSafetyStateDto,
  MqttSettings,
  MqttStatus,
  QualificationMalfunctionSignalDto,
  RangeOfficerRequestDto,
  RequestRangeOfficerInput,
} from './mqtt.contract';

export { timedTargetContract } from './timedTarget.contract';
export type { TimedTargetStateDto } from './timedTarget.contract';

export { AppUpdateStateSchema, AppUpdateStatusSchema, updaterContract } from './updater.contract';
export type { AppUpdateStateDto, AppUpdateStatus } from './updater.contract';

export { vistaContract } from './vista.contract';
