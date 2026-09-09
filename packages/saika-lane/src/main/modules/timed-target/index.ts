// SPDX-License-Identifier: MIT
export { BoundedShotTimingPolicy, type IShotTimingPolicy } from './domain/ShotTimingPolicy';
export {
  TimedTargetSequenceService,
  timedTargetEnforcementModeFromEnvironment,
} from './application/TimedTargetSequenceService';
export type { TimedTargetClock } from './application/TimedTargetSequenceService';
export type {
  ITimedTargetControl,
  ITimedTargetStateSink,
  TimedTargetEnforcementMode,
  TimedTargetShotDecision,
  TimedTargetState,
} from './domain/ITimedTargetControl';
export type { TimedTargetExecutionContext } from './domain/TimedTargetExecutionContext';
export type {
  ITimedTargetSequenceRepository,
  TimedTargetAcceptedShot,
  TimedTargetSequenceRecord,
  TimedTargetTerminalStatus,
} from './domain/ITimedTargetSequenceRepository';
export {
  buildTimedTargetSchedule,
  parseTimedTargetSchedule,
  projectTimedTargetSchedule,
  serializeTimedTargetSchedule,
} from './domain/TimedTargetSchedule';
export type {
  ScheduledTimedTargetExposure,
  TimedTargetProjection,
  TimedTargetSchedule,
  TimedTargetSequencePhase,
  TimedTargetSignal,
} from './domain/TimedTargetSchedule';
export { SqliteTimedTargetSequenceRepository } from './infra/SqliteTimedTargetSequenceRepository';
export { timedTargetModule } from './timedTarget.module';
