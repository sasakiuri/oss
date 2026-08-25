// Contract objects
export { championshipContract } from './championship.contract';
export { laneControlContract } from './laneControl.contract';
export { resultsContract } from './results.contract';
export { boardContract } from './board.contract';
export { shootoffContract } from './shootoff.contract';
export { mqttContract } from './mqtt.contract';
export { eventsContract } from './events.contract';
export { debugContract } from './debug.contract';

// Common types (from defineContract)
export type { CommandResponseDto, CommandResponse, IpcErrorDto, IpcError } from '../defineContract';

// Championship types
export type {
  ChampionshipDto,
  EventDto,
  ChampionshipDetailDto,
  ChampionshipDetailResponse,
  ParticipantDto,
  FiringPointAssignmentDto,
  ChampionshipListResponse,
  ParticipantListResponse,
  FiringPointAssignmentListResponse,
  CreateChampionshipPayload,
  UpdateChampionshipPayload,
  DeleteChampionshipPayload,
  CreateEventPayload,
  DeleteEventPayload,
  UpdateEventPayload,
  SaveParticipantsPayload,
  SaveFiringPointAssignmentsPayload,
  CompetitionTypeDto,
  CompetitionTypeListResponse,
} from './championship.contract';

// Results types
export type {
  RankedResultDto,
  FinalRankedResultDto,
  PublishResultsResponse,
  ConfirmResultsResponse,
  GetRelayResultsResponse,
  GetEventResultsResponse,
  GetFinalEventResultsResponse,
  PublishResultsPayload,
  ConfirmResultsPayload,
  GetEventResultsPayload,
  GetRelayResultsPayload,
  GetFinalEventResultsPayload,
} from './results.contract';

// Lane Control types
export type {
  ShotDto,
  ScoreSheetShotDto,
  ScoreSheetDto,
  GetScoreSheetsResponse,
  AssignPlayersPayload,
  MoveLanePayload,
  EditShotPayload,
  DeleteShotPayload,
  InsertShotPayload,
  EliminatePayload,
} from './laneControl.contract';

// Shootoff types
export type { StartShootoffPayload, AddShotPayload } from './shootoff.contract';

// Debug types
export type { DebugLogEntry, DebugLogResponse } from './debug.contract';

// MQTT types
export type {
  BrokerConfig,
  SetBrokerConfigPayload,
  BrokerStatus,
  DirectorLaneSnapshotDto,
  MqttControlSnapshotDto,
  MqttCommandExecutionResultDto,
  MqttCommandBatchResultDto,
} from './mqtt.contract';

// Board types
export type {
  OpenTargetBoardPayload,
  OpenResultsBoardPayload,
  OpenFinalBoardPayload,
  OpenScoreSheetPrintPayload,
  OpenResultsListPrintPayload,
} from './board.contract';

// Event types
export type {
  IpcEvents,
  ShotReceivedEvent,
  PhaseChangedEvent,
  LaneConnectedEvent,
  TimerTickEvent,
  TimerExpiredEvent,
  DebugLogEvent,
  LaneTimerTickEvent,
  LaneTimerExpiredEvent,
  LaneControlUpdatedEvent,
  LaneControlPatchedEvent,
  MqttControlStateChangedEvent,
} from './events.contract';
