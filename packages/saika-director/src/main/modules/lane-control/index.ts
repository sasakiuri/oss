// Domain entities (used by lane-control module and tests)
export { LaneControl } from './domain/LaneControl';

// Value Objects (used cross-module and tests)
export { Channel } from './domain/Channel';
export { Score } from './domain/Score';
export { ShotNumber } from './domain/ShotNumber';
export { Checksum } from './domain/Checksum';
export { Player } from './domain/Player';
export { Round } from './domain/Round';

// Repository interfaces (used by composition and tests)
export type { ILaneControlRepository } from './domain/ILaneControlRepository';

// Snapshot type (used by persistence layer)
export type { LaneControlSnapshot } from './domain/LaneControl';

// Infrastructure implementations (used by composition)
export { InMemoryLaneControlRepository } from './infra/InMemoryLaneControlRepository';
export { SqliteLaneControlRepository } from './infra/SqliteLaneControlRepository';
export { LaneTimerService } from './infra/LaneTimerService';
export { DiffCalculator } from './infra/DiffCalculator';

// Command helpers (used by lane-control module and mqtt module)
export { emitLaneControlUpdated } from './commands/helpers/emitLaneControlUpdated';

// Cross-module command/query tokens
export {
  StartPreparationToken,
  AdvanceToNextStageToken,
  StartSeriesToken,
  FinishToken,
  ClearToken,
  AssignPlayersToken,
  MoveLaneToken,
  EditShotToken,
  DeleteShotToken,
  InsertShotToken,
  EliminatePlayerToken,
  RecordShotToken,
  StartLaneShootoffToken,
  AddLaneShootoffShotToken,
  ResolveLaneShootoffToken,
  GetScoreSheetsToken,
  GetAllLaneControlsToken,
  GetDebugLogToken,
  GetLaneByIdToken,
  GetLaneByChannelToken,
  GetAllLanesToken,
} from './tokens';

// Domain events consumed across module boundaries
export type {
  LanePhaseChanged,
  LaneTimerTick,
  LaneTimerExpired,
  LaneControlUpdated,
  ShotAdded,
  ShotEdited,
  ShotDeleted,
  ShotInserted,
  LaneMoved,
} from './domain/events';

// Module definition
export { laneControlModule } from './lane-control.module';
