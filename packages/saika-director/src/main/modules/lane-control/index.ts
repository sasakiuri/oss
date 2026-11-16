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
export { SqliteLaneControlRepository } from './infra/SqliteLaneControlRepository';
export { LaneTimerService } from './infra/LaneTimerService';
export { DiffCalculator } from './infra/DiffCalculator';

// Cross-module command/query tokens
export {
  EliminatePlayerToken,
  StartLaneShootoffToken,
  AddLaneShootoffShotToken,
  ResolveLaneShootoffToken,
  GetLaneByIdToken,
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
export { laneControlModule } from './laneControl.module';
