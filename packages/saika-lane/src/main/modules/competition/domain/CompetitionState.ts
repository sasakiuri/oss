// SPDX-License-Identifier: MIT

import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

import type { RoundConfig, SeriesDefinition, StageDefinition } from './CompetitionTypeDefinition';
import type { Phase } from './Phase';
import { Timer } from './Timer';

/**
 * Properties for reconstructing CompetitionState
 */
interface CompetitionStateProps {
  readonly id: string;
  readonly sessionId: string;
  readonly config: RoundConfig;
  readonly phase: Phase;
  readonly currentStageIndex: number;
  readonly currentSeriesIndex: number;
  readonly seriesShotCount: number;
  readonly timer: Timer;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
}

/**
 * CompetitionState — competition state aggregate root
 *
 * Immutable aggregate root managing the competition state machine.
 * All methods return a new instance.
 *
 * State transitions:
 *   IDLE → startStage() → ACTIVE
 *   ACTIVE → recordShotInSeries() → ACTIVE | SERIES_COMPLETE
 *   ACTIVE → expireTimer() → SERIES_COMPLETE
 *   ACTIVE[unscored] → endStage() → SERIES_COMPLETE
 *   SERIES_COMPLETE → startNextSeries() → ACTIVE
 *   SERIES_COMPLETE → advanceToNextStage() → SERIES_ENTERED | STAGE_ENTERED | FINISHED
 *   SERIES_COMPLETE → rewindToStage(index) → ACTIVE
 *   SERIES_ENTERED → startNextSeries() → ACTIVE
 *   SERIES_ENTERED → rewindToStage(index) → ACTIVE
 *   STAGE_ENTERED → startNextSeries() → ACTIVE
 *   STAGE_ENTERED → rewindToStage(index) → ACTIVE
 *   ACTIVE[scored] → rewindToStage(index) → ACTIVE
 *   ACTIVE → resetToIdle() → IDLE
 *   any → finish() → FINISHED
 */
export class CompetitionState {
  readonly id: string;
  readonly sessionId: string;
  readonly config: RoundConfig;
  readonly phase: Phase;
  readonly currentStageIndex: number;
  readonly currentSeriesIndex: number;
  readonly seriesShotCount: number;
  readonly timer: Timer;
  readonly startedAt: number | null;
  readonly finishedAt: number | null;

  private constructor(props: CompetitionStateProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.config = props.config;
    this.phase = props.phase;
    this.currentStageIndex = props.currentStageIndex;
    this.currentSeriesIndex = props.currentSeriesIndex;
    this.seriesShotCount = props.seriesShotCount;
    this.timer = props.timer;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;

    Object.freeze(this);
  }

  /**
   * Internal: creates a new instance with partial property overrides
   */
  private with(overrides: Partial<CompetitionStateProps>): CompetitionState {
    return new CompetitionState({
      id: this.id,
      sessionId: this.sessionId,
      config: this.config,
      phase: this.phase,
      currentStageIndex: this.currentStageIndex,
      currentSeriesIndex: this.currentSeriesIndex,
      seriesShotCount: this.seriesShotCount,
      timer: this.timer,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      ...overrides,
    });
  }

  // ── Computed getters ──

  /**
   * Returns the current stage configuration
   */
  get currentStageConfig(): StageDefinition {
    return this.config.stages[this.currentStageIndex]!;
  }

  /**
   * Returns the current series configuration
   */
  get currentSeriesConfig(): SeriesDefinition {
    return this.currentStageConfig.series[this.currentSeriesIndex]!;
  }

  // ── State transitions ──

  /**
   * Starts the first stage (IDLE → ACTIVE)
   *
   * Starts with the timer of the first stage.
   */
  startStage(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'IDLE') {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot start stage from phase: ${this.phase}`,
      });
    }

    const stageConfig = this.config.stages[0]!;
    const timer = stageConfig.timer ? Timer.create(stageConfig.timer.durationSeconds) : Timer.create(0);

    return this.with({
      phase: 'ACTIVE',
      currentStageIndex: 0,
      currentSeriesIndex: 0,
      seriesShotCount: 0,
      timer,
      startedAt: Date.now(),
    });
  }

  /**
   * Restarts the current unscored stage (ACTIVE[unscored] → ACTIVE)
   *
   * Resets seriesShotCount and recreates the timer.
   * Can only be called when in ACTIVE state for an unscored stage (scored === false).
   */
  restartStage(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'ACTIVE' || this.currentStageConfig.scored !== false) {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot restart stage from phase: ${this.phase}, scored: ${this.currentStageConfig.scored}`,
      });
    }

    const stageConfig = this.config.stages[this.currentStageIndex]!;
    const timer = stageConfig.timer ? Timer.create(stageConfig.timer.durationSeconds) : Timer.create(0);

    return this.with({
      phase: 'ACTIVE',
      currentSeriesIndex: 0,
      seriesShotCount: 0,
      timer,
    });
  }

  /**
   * Ends the current unscored stage (ACTIVE[unscored] → SERIES_COMPLETE)
   *
   * Can only be called when in ACTIVE state for an unscored stage (scored === false).
   * Expires the timer and transitions to SERIES_COMPLETE.
   */
  endStage(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'ACTIVE' || this.currentStageConfig.scored !== false) {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot end stage from phase: ${this.phase}, scored: ${this.currentStageConfig.scored}`,
      });
    }

    const timer = this.timer.isExpired ? this.timer : this.timer.tickBy(this.timer.remainingSeconds);

    return this.with({
      phase: 'SERIES_COMPLETE',
      timer,
    });
  }

  /**
   * Starts the next series (SERIES_COMPLETE/SERIES_ENTERED/STAGE_ENTERED → ACTIVE)
   *
   * Starts with the appropriate timer configured.
   */
  startNextSeries(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'SERIES_COMPLETE' && this.phase !== 'SERIES_ENTERED' && this.phase !== 'STAGE_ENTERED') {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot start next series from phase: ${this.phase}`,
      });
    }

    const stageConfig = this.currentStageConfig;
    const seriesConfig = stageConfig.series[this.currentSeriesIndex];

    // Use series timer if available, otherwise retain the stage timer
    let timer: Timer;
    if (seriesConfig?.timer) {
      timer = Timer.create(seriesConfig.timer.durationSeconds);
    } else if ((this.phase === 'STAGE_ENTERED' || this.phase === 'SERIES_ENTERED') && stageConfig.timer) {
      timer = Timer.create(stageConfig.timer.durationSeconds);
    } else {
      timer = this.timer;
    }

    return this.with({
      phase: 'ACTIVE',
      seriesShotCount: 0,
      timer,
    });
  }

  /**
   * Records a shot in the series (ACTIVE → ACTIVE | SERIES_COMPLETE)
   *
   * Automatically transitions to SERIES_COMPLETE when maxShots is reached.
   */
  recordShotInSeries(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'ACTIVE') {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot record shot in phase: ${this.phase}`,
      });
    }

    const newShotCount = this.seriesShotCount + 1;
    const maxShots = this.currentSeriesConfig.maxShots;

    // If maxShots > 0 and the limit is reached, complete the series
    if (maxShots > 0 && newShotCount >= maxShots) {
      return this.with({
        phase: 'SERIES_COMPLETE',
        seriesShotCount: newShotCount,
      });
    }

    return this.with({
      seriesShotCount: newShotCount,
    });
  }

  /**
   * Handles timer expiry (ACTIVE → SERIES_COMPLETE)
   *
   * Transitions to SERIES_COMPLETE regardless of series mode or stage mode.
   */
  expireTimer(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'ACTIVE') {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot expire timer in phase: ${this.phase}`,
      });
    }

    // Only set to 0 if timer has not yet expired (avoid double subtraction if already 0 via tickTimerBy)
    const timer = this.timer.isExpired ? this.timer : this.timer.tickBy(this.timer.remainingSeconds);

    return this.with({
      phase: 'SERIES_COMPLETE',
      timer,
    });
  }

  /**
   * Advances to the next stage (SERIES_COMPLETE → SERIES_ENTERED | STAGE_ENTERED | FINISHED)
   *
   * If the current stage has a next series, transitions to SERIES_ENTERED (advancing series within the same stage);
   * if there is a next stage, transitions to STAGE_ENTERED; otherwise transitions to FINISHED.
   */
  advanceToNextStage(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'SERIES_COMPLETE') {
      throw ErrorCatalog.createError('SERIES_NOT_COMPLETE', {
        detail: `Cannot advance from phase: ${this.phase}`,
      });
    }

    const stageConfig = this.currentStageConfig;
    const nextSeriesIndex = this.currentSeriesIndex + 1;

    // If there is a next series within the current stage (advancing series within the same stage)
    if (nextSeriesIndex < stageConfig.series.length) {
      return this.with({
        phase: 'SERIES_ENTERED',
        currentSeriesIndex: nextSeriesIndex,
        seriesShotCount: 0,
      });
    }

    // If there is a next stage
    const nextStageIndex = this.currentStageIndex + 1;
    if (nextStageIndex < this.config.stages.length) {
      return this.with({
        phase: 'STAGE_ENTERED',
        currentStageIndex: nextStageIndex,
        currentSeriesIndex: 0,
        seriesShotCount: 0,
      });
    }

    // All stages complete
    return this.with({
      phase: 'FINISHED',
      finishedAt: Date.now(),
    });
  }

  /**
   * Resets to IDLE state (ACTIVE → IDLE)
   *
   * Returns to the state immediately after app launch. Resets timer, stage, and series.
   * Can only be called in the ACTIVE phase.
   */
  resetToIdle(): CompetitionState {
    this.assertNotFinished();
    if (this.phase !== 'ACTIVE') {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot reset to IDLE from phase: ${this.phase}`,
      });
    }

    return this.with({
      phase: 'IDLE',
      currentStageIndex: 0,
      currentSeriesIndex: 0,
      seriesShotCount: 0,
      timer: Timer.create(0),
    });
  }

  /**
   * Rewinds to the specified stage (SERIES_COMPLETE/SERIES_ENTERED/STAGE_ENTERED/ACTIVE[scored] → ACTIVE)
   *
   * Resets to the specified stage and reconfigures the timer.
   *
   * @param index - The stage index to rewind to (default: 0)
   */
  rewindToStage(index: number = 0): CompetitionState {
    this.assertNotFinished();
    if (
      this.phase !== 'SERIES_COMPLETE' &&
      this.phase !== 'SERIES_ENTERED' &&
      this.phase !== 'STAGE_ENTERED' &&
      this.phase !== 'ACTIVE'
    ) {
      throw ErrorCatalog.createError('INVALID_PHASE_TRANSITION', {
        detail: `Cannot rewind to stage from phase: ${this.phase}`,
      });
    }

    const stageConfig = this.config.stages[index]!;
    const timer = stageConfig.timer ? Timer.create(stageConfig.timer.durationSeconds) : Timer.create(0);

    return this.with({
      phase: 'ACTIVE',
      currentStageIndex: index,
      currentSeriesIndex: 0,
      seriesShotCount: 0,
      timer,
    });
  }

  /**
   * Finishes the competition (any → FINISHED)
   */
  finish(): CompetitionState {
    this.assertNotFinished();
    return this.with({
      phase: 'FINISHED',
      finishedAt: Date.now(),
    });
  }

  /**
   * Updates the session ID (for session switching)
   */
  withSessionId(newSessionId: string): CompetitionState {
    return this.with({ sessionId: newSessionId });
  }

  /**
   * Advances the timer by n seconds
   *
   * @param seconds - The number of seconds to subtract
   */
  tickTimerBy(seconds: number): CompetitionState {
    return this.with({
      timer: this.timer.tickBy(seconds),
    });
  }

  /**
   * Determines whether a shot can be accepted
   */
  canAcceptShot(): boolean {
    return this.phase === 'ACTIVE' || this.phase === 'IDLE';
  }

  // ── Guards ──

  private assertNotFinished(): void {
    if (this.phase === 'FINISHED') {
      throw ErrorCatalog.createError('COMPETITION_ALREADY_FINISHED', {
        detail: 'Cannot perform operation on a finished competition',
      });
    }
  }

  // ── Factory methods ──

  /**
   * Creates a new CompetitionState in the IDLE phase
   *
   * @param id - Unique identifier
   * @param sessionId - The associated session ID
   * @param config - Round configuration
   */
  static create(id: string, sessionId: string, config: RoundConfig): CompetitionState {
    return new CompetitionState({
      id,
      sessionId,
      config,
      phase: 'IDLE',
      currentStageIndex: 0,
      currentSeriesIndex: 0,
      seriesShotCount: 0,
      timer: Timer.create(0),
      startedAt: null,
      finishedAt: null,
    });
  }

  /**
   * Factory method for reconstruction from the repository
   */
  static reconstruct(props: CompetitionStateProps): CompetitionState {
    return new CompetitionState(props);
  }
}
