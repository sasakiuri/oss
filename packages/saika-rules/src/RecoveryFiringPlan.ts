import type { TimedTargetProgram } from './RulePack';

/** Acquisition instructions only: authorization and score settlement belong to callers. */
export interface RecoveryFiringPlan {
  readonly remedy: 'REPEAT_FULL_SERIES' | 'COMPLETE_REMAINING_SHOTS';
  readonly shotsToFire: number;
  readonly ruleReference: string;
  readonly program: TimedTargetProgram;
}
