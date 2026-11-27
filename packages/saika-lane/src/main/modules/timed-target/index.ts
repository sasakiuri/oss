// SPDX-License-Identifier: MIT
export { BoundedShotTimingPolicy, type IShotTimingPolicy } from './domain/ShotTimingPolicy';
export {
  TimedTargetSequenceService,
  timedTargetEnforcementModeFromEnvironment,
} from './application/TimedTargetSequenceService';
export type { TimedTargetClock } from './application/TimedTargetSequenceService';
export {
  cancelActiveTimedTarget,
  type ITimedTargetControl,
  type ITimedTargetStateSink,
  type TimedTargetEnforcementMode,
  type TimedTargetShotDecision,
  type TimedTargetState,
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
  isTerminalTimedTargetPhase,
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
export { timedTargetModule } from './timedTarget.module';
