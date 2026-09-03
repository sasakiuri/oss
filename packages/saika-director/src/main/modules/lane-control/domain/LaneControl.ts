import { Channel } from './Channel';
import { Player } from './Player';
import { Timer } from './Timer';
import { Shot, type ShotDisposition } from './Shot';
import { DomainError, ErrorCatalog } from '@/shared/errors';
import type { LanePhase } from '@/shared/constants/competition';
import type { RoundConfig } from '@/shared/constants/roundConfig';
import type { StageDefinition, SeriesDefinition, TimerMode } from '@/shared/competitionTypes/CompetitionTypeDefinition';
import * as ScoreGetters from './ScoreGetters';
import * as ShotEditor from './ShotEditor';
import * as ShootoffOps from './ShootoffOps';
import * as ButtonConditions from './ButtonConditions';
import * as TimerModeHandlers from './TimerModeHandlers';
import { planRemainingSeriesSlots, planRemainingStageSlots } from './ShotSlotPlanner';

// ---------------------------------------------------------------------------
// Snapshot types (for persistence serialization)
// ---------------------------------------------------------------------------

export interface ShotSnapshot {
  readonly shotNumber: number;
  readonly score: number;
  readonly seriesNumber: number;
  /** Missing in snapshots written before explicit shot-slot dispositions were introduced. */
  readonly disposition?: ShotDisposition;
}

export interface TimerSnapshot {
  readonly remainingSeconds: number;
  readonly totalSeconds: number;
}

export interface PlayerSnapshot {
  readonly name: string;
  readonly affiliation: string;
  readonly participantId?: string;
  readonly logoPath?: string;
}

export interface LaneControlSnapshot {
  readonly id: string;
  readonly channel: number;
  readonly player: PlayerSnapshot | null;
  readonly config: RoundConfig;
  readonly phase: LanePhase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotSlotInSeries: number;
  readonly timer: TimerSnapshot | null;
  readonly preparationShots: ShotSnapshot[];
  readonly matchShots: ShotSnapshot[];
  readonly shootoffShots: ShotSnapshot[];
  readonly eliminated: boolean;
  readonly eliminationRank: number | null;
  readonly lastShotTime: number | null;
  readonly relayNumber: number;
  readonly lastReceivedShotNumber: number | null;
  readonly matchShotsAtSeriesStart: number;
}

export interface LaneControlState {
  readonly id: string;
  readonly channel: Channel;
  readonly player: Player | null;
  readonly config: RoundConfig;
  readonly phase: LanePhase;
  readonly stageIndex: number;
  readonly seriesIndex: number;
  readonly shotSlotInSeries: number;
  readonly timer: Timer | null;
  readonly preparationShots: Shot[];
  readonly matchShots: Shot[];
  readonly shootoffShots: Shot[];
  readonly eliminated: boolean;
  readonly eliminationRank: number | null;
  readonly lastShotTime: number | null;
  readonly relayNumber: number;
  readonly lastReceivedShotNumber: number | null;
  readonly matchShotsAtSeriesStart: number;
}

export type MutablePatch = Partial<Omit<LaneControlState, 'id' | 'channel' | 'config'>>;

export class LaneControl {
  private constructor(private readonly state: LaneControlState) {}

  // ---------------------------------------------------------------------------
  // Public getters
  // ---------------------------------------------------------------------------

  get id(): string {
    return this.state.id;
  }
  get channel(): Channel {
    return this.state.channel;
  }
  get player(): Player | null {
    return this.state.player;
  }
  get config(): RoundConfig {
    return this.state.config;
  }
  get phase(): LanePhase {
    return this.state.phase;
  }
  get stageIndex(): number {
    return this.state.stageIndex;
  }
  get seriesIndex(): number {
    return this.state.seriesIndex;
  }
  get shotSlotInSeries(): number {
    return this.state.shotSlotInSeries;
  }
  get timer(): Timer | null {
    return this.state.timer;
  }
  get eliminated(): boolean {
    return this.state.eliminated;
  }
  get eliminationRank(): number | null {
    return this.state.eliminationRank;
  }
  get lastShotTime(): number | null {
    return this.state.lastShotTime;
  }
  get relayNumber(): number {
    return this.state.relayNumber;
  }
  get lastReceivedShotNumber(): number | null {
    return this.state.lastReceivedShotNumber;
  }

  get currentStage(): StageDefinition {
    const stage = this.state.config.stages[this.state.stageIndex];
    if (!stage) {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: `Stage index ${this.state.stageIndex} out of bounds`,
      });
    }
    return stage;
  }

  get currentSeries(): SeriesDefinition {
    const series = this.currentStage.series[this.state.seriesIndex];
    if (!series) {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: `Series index ${this.state.seriesIndex} out of bounds in stage ${this.state.stageIndex}`,
      });
    }
    return series;
  }

  get timerMode(): TimerMode {
    return this.currentStage.timer.mode;
  }

  get currentStageName(): string {
    return this.currentStage.name;
  }

  get preparationShots(): Shot[] {
    return [...this.state.preparationShots];
  }

  get matchShots(): Shot[] {
    return [...this.state.matchShots];
  }

  get shootoffShots(): Shot[] {
    return [...this.state.shootoffShots];
  }

  // ---------------------------------------------------------------------------
  // Internal helper
  // ---------------------------------------------------------------------------

  private with(patch: MutablePatch): LaneControl {
    return new LaneControl({
      ...this.state,
      ...patch,
    });
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  static create(id: string, channel: Channel, config: RoundConfig, relayNumber: number = 1): LaneControl {
    return new LaneControl({
      id,
      channel,
      player: null,
      config,
      phase: 'IDLE',
      stageIndex: 0,
      seriesIndex: 0,
      shotSlotInSeries: 0,
      timer: null,
      preparationShots: [],
      matchShots: [],
      shootoffShots: [],
      eliminated: false,
      eliminationRank: null,
      lastShotTime: null,
      relayNumber,
      lastReceivedShotNumber: null,
      matchShotsAtSeriesStart: 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Snapshot serialization (for persistence)
  // ---------------------------------------------------------------------------

  private static serializeShots(shots: Shot[]): ShotSnapshot[] {
    return shots.map((s) => ({
      shotNumber: s.shotNumber.value,
      score: s.score.value,
      seriesNumber: s.seriesNumber,
      disposition: s.disposition,
    }));
  }

  private static deserializeShots(snapshots: ShotSnapshot[]): Shot[] {
    return snapshots.map((s) => Shot.create(s.shotNumber, s.score, s.seriesNumber, s.disposition ?? 'SCORED'));
  }

  toSnapshot(): LaneControlSnapshot {
    const player = this.state.player;
    const timer = this.state.timer;
    return {
      id: this.state.id,
      channel: this.state.channel.value,
      player: player
        ? {
            name: player.name,
            affiliation: player.affiliation,
            participantId: player.participantId,
            logoPath: player.logoPath,
          }
        : null,
      config: this.state.config,
      phase: this.state.phase,
      stageIndex: this.state.stageIndex,
      seriesIndex: this.state.seriesIndex,
      shotSlotInSeries: this.state.shotSlotInSeries,
      timer: timer
        ? {
            remainingSeconds: timer.remainingSeconds,
            totalSeconds: timer.totalSeconds,
          }
        : null,
      preparationShots: LaneControl.serializeShots(this.state.preparationShots),
      matchShots: LaneControl.serializeShots(this.state.matchShots),
      shootoffShots: LaneControl.serializeShots(this.state.shootoffShots),
      eliminated: this.state.eliminated,
      eliminationRank: this.state.eliminationRank,
      lastShotTime: this.state.lastShotTime,
      relayNumber: this.state.relayNumber,
      lastReceivedShotNumber: this.state.lastReceivedShotNumber,
      matchShotsAtSeriesStart: this.state.matchShotsAtSeriesStart,
    };
  }

  static fromSnapshot(snapshot: LaneControlSnapshot): LaneControl {
    return new LaneControl({
      id: snapshot.id,
      channel: Channel.create(snapshot.channel),
      player: snapshot.player
        ? Player.create(
            snapshot.player.name,
            snapshot.player.affiliation,
            snapshot.player.participantId,
            snapshot.player.logoPath,
          )
        : null,
      config: snapshot.config,
      phase: snapshot.phase,
      stageIndex: snapshot.stageIndex,
      seriesIndex: snapshot.seriesIndex,
      shotSlotInSeries: snapshot.shotSlotInSeries,
      timer: snapshot.timer ? Timer.restore(snapshot.timer.remainingSeconds, snapshot.timer.totalSeconds) : null,
      preparationShots: LaneControl.deserializeShots(snapshot.preparationShots),
      matchShots: LaneControl.deserializeShots(snapshot.matchShots),
      shootoffShots: LaneControl.deserializeShots(snapshot.shootoffShots),
      eliminated: snapshot.eliminated,
      eliminationRank: snapshot.eliminationRank,
      lastShotTime: snapshot.lastShotTime,
      relayNumber: snapshot.relayNumber,
      lastReceivedShotNumber: snapshot.lastReceivedShotNumber,
      matchShotsAtSeriesStart: snapshot.matchShotsAtSeriesStart,
    });
  }

  // ---------------------------------------------------------------------------
  // State transitions
  // ---------------------------------------------------------------------------

  startPreparation(): LaneControl {
    if (this.state.phase !== 'IDLE') {
      throw DomainError.from(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION);
    }
    const stage = this.state.config.stages[0];
    if (!stage || stage.type !== 'preparation') {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: 'First stage must be a preparation stage',
      });
    }
    const timer = Timer.create(stage.timer.durationSec);
    return this.with({
      phase: 'ACTIVE',
      stageIndex: 0,
      seriesIndex: 0,
      shotSlotInSeries: 0,
      timer,
      preparationShots: [],
      lastReceivedShotNumber: null,
    });
  }

  /**
   * ACTIVE(prep) / SERIES_COMPLETE → STAGE_ENTERED
   *
   */
  advanceToNextStage(): LaneControl {
    if (
      this.state.phase !== 'ACTIVE' &&
      this.state.phase !== 'SERIES_COMPLETE' &&
      this.state.phase !== 'SHOT_COMPLETE'
    ) {
      throw DomainError.from(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION);
    }

    const nextStageIndex = this.state.stageIndex + 1;
    if (nextStageIndex >= this.state.config.stages.length) {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: 'No next stage found',
      });
    }
    return this.with({
      phase: 'STAGE_ENTERED',
      stageIndex: nextStageIndex,
      seriesIndex: 0,
      shotSlotInSeries: 0,
      timer: null,
    });
  }

  startMatch(): LaneControl {
    if (this.state.phase === 'SHOT_COMPLETE') {
      const stage = this.currentStage;
      const timer = Timer.create(stage.timer.durationSec);
      return this.with({
        phase: 'ACTIVE',
        timer,
      });
    }

    if (this.state.phase === 'STAGE_ENTERED') {
      const stage = this.currentStage;
      const timer = Timer.create(stage.timer.durationSec);
      return this.with({
        phase: 'ACTIVE',
        seriesIndex: 0,
        shotSlotInSeries: 0,
        timer,
        matchShotsAtSeriesStart: this.state.matchShots.length,
      });
    }

    if (this.state.phase === 'SERIES_COMPLETE' || this.state.phase === 'ACTIVE') {
      // Move to next series within the same stage
      const stage = this.currentStage;
      const nextSeriesIndex = this.state.seriesIndex + 1;
      if (nextSeriesIndex >= stage.series.length) {
        throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
          messageOverride: 'No next series in current stage; use advanceToNextStage instead',
        });
      }
      // For mode: stage, timer expired means no match restart allowed
      if (stage.timer.mode === 'stage' && this.state.timer?.isExpired) {
        throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
          messageOverride: 'Cannot start match: stage timer has expired',
        });
      }
      const timerMode = stage.timer.mode;
      let timer: Timer | null;
      if (timerMode === 'stage') {
        // Keep existing timer (continuous for the whole stage)
        timer = this.state.timer;
      } else {
        // series or shot mode: new timer for each series
        timer = Timer.create(stage.timer.durationSec);
      }
      return this.with({
        phase: 'ACTIVE',
        seriesIndex: nextSeriesIndex,
        shotSlotInSeries: 0,
        timer,
        matchShotsAtSeriesStart: this.state.matchShots.length,
      });
    }

    throw DomainError.from(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION);
  }

  addShotByScore(score: number, timestamp: number, receivedShotNumber: number): LaneControl {
    const stage = this.currentStage;

    if (this.state.phase === 'ACTIVE' && stage.type === 'preparation') {
      // Preparation shot
      const nextShotNum = this.state.preparationShots.length + 1;
      const shot = Shot.create(nextShotNum, score, 1); // seriesNumber=1 for preparation
      return this.with({
        preparationShots: [...this.state.preparationShots, shot],
        lastShotTime: timestamp,
        lastReceivedShotNumber: receivedShotNumber,
      });
    }

    if (this.state.phase === 'ACTIVE' && stage.type === 'match') {
      const series = this.currentSeries;
      if (series.shots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') {
        throw new DomainError(ErrorCatalog.SHOT.CANNOT_EDIT_IN_PHASE, {
          messageOverride: 'Cannot add a MATCH shot during position change and sighting',
        });
      }
      const nextShotNum = this.state.matchShots.length + 1;
      // Calculate seriesNumber from stageIndex/seriesIndex
      const seriesNumber = this.calculateGlobalSeriesNumber();
      const shot = Shot.create(nextShotNum, score, seriesNumber);
      const newMatchShots = [...this.state.matchShots, shot];

      const timerMode = stage.timer.mode;

      switch (timerMode) {
        case 'shot':
          return this.with(
            TimerModeHandlers.handleShotModeShot(
              this.state,
              stage,
              series,
              newMatchShots,
              timestamp,
              receivedShotNumber,
            ),
          );
        case 'series':
          return this.with(
            TimerModeHandlers.handleSeriesModeShot(this.state, series, newMatchShots, timestamp, receivedShotNumber),
          );
        case 'stage':
          return this.with(
            TimerModeHandlers.handleStageModeShot(this.state, stage, newMatchShots, timestamp, receivedShotNumber),
          );
        default:
          // Fallback (shouldn't reach here)
          return this.with({
            matchShots: newMatchShots,
            lastShotTime: timestamp,
            lastReceivedShotNumber: receivedShotNumber,
          });
      }
    }

    throw DomainError.from(ErrorCatalog.SHOT.CANNOT_EDIT_IN_PHASE);
  }

  finish(): LaneControl {
    if (
      this.state.phase !== 'ACTIVE' &&
      this.state.phase !== 'SERIES_COMPLETE' &&
      this.state.phase !== 'SHOT_COMPLETE'
    ) {
      throw DomainError.from(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION);
    }
    return this.with({
      phase: 'FINISHED',
      timer: null,
    });
  }

  tickTimer(elapsedSeconds?: number): LaneControl {
    if (!this.state.timer || this.state.phase !== 'ACTIVE') return this;
    const newTimer =
      elapsedSeconds !== undefined && elapsedSeconds !== 1
        ? this.state.timer.tickBy(elapsedSeconds)
        : this.state.timer.tick();

    if (newTimer.isExpired) {
      const stage = this.currentStage;
      if (stage.type === 'preparation') {
        return this.with({ timer: newTimer });
      }
      switch (stage.timer.mode) {
        case 'shot': {
          const missedSlot = planRemainingSeriesSlots({
            firstShotNumber: this.state.matchShots.length + 1,
            seriesNumber: this.calculateGlobalSeriesNumber(),
            expectedShots: this.currentSeries.shots,
            occupiedShots: this.state.shotSlotInSeries,
          })[0];
          if (!missedSlot) {
            return this.with({ timer: newTimer });
          }
          return this.with(
            TimerModeHandlers.handleShotTimerExpired(
              this.state,
              stage,
              newTimer,
              Shot.miss(missedSlot.shotNumber, missedSlot.seriesNumber),
            ),
          );
        }
        case 'series': {
          const missedShots = this.planRemainingCurrentSeriesMisses();
          return this.with(TimerModeHandlers.handleSeriesTimerExpired(this.state, newTimer, missedShots));
        }
        case 'stage': {
          const missedShots = this.planRemainingCurrentStageMisses();
          return this.with(TimerModeHandlers.handleStageTimerExpired(this.state, newTimer, missedShots));
        }
      }
    }

    return this.with({ timer: newTimer });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private calculateGlobalSeriesNumber(): number {
    let globalSeries = 0;
    for (let si = 0; si < this.state.config.stages.length; si++) {
      const s = this.state.config.stages[si]!;
      if (s.type !== 'match') continue;
      for (let ri = 0; ri < s.series.length; ri++) {
        const series = s.series[ri]!;
        if (series.shots === 0 || series.purpose === 'POSITION_CHANGE_AND_SIGHTING') continue;
        globalSeries++;
        if (si === this.state.stageIndex && ri === this.state.seriesIndex) {
          return globalSeries;
        }
      }
    }
    return globalSeries + 1;
  }

  private planRemainingCurrentSeriesMisses(): Shot[] {
    const occupiedShots = this.state.matchShots.length - this.state.matchShotsAtSeriesStart;
    return planRemainingSeriesSlots({
      firstShotNumber: this.state.matchShots.length + 1,
      seriesNumber: this.calculateGlobalSeriesNumber(),
      expectedShots: this.currentSeries.shots,
      occupiedShots,
    }).map((slot) => Shot.miss(slot.shotNumber, slot.seriesNumber));
  }

  private planRemainingCurrentStageMisses(): Shot[] {
    const stage = this.currentStage;
    const occupiedShotsInCurrentSeries = this.state.matchShots.length - this.state.matchShotsAtSeriesStart;
    return planRemainingStageSlots({
      firstShotNumber: this.state.matchShots.length + 1,
      firstSeriesNumber: this.calculateGlobalSeriesNumber(),
      seriesShotCounts: stage.series.slice(this.state.seriesIndex).map((series) => series.shots),
      occupiedShotsInFirstSeries: occupiedShotsInCurrentSeries,
    }).map((slot) => Shot.miss(slot.shotNumber, slot.seriesNumber));
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  eliminate(rank: number): LaneControl {
    return this.with(ShootoffOps.eliminate(this.state, rank));
  }

  startShootoff(): LaneControl {
    return this.with(ShootoffOps.startShootoff(this.state));
  }

  addShootoffShot(score: number): LaneControl {
    return this.with(ShootoffOps.addShootoffShot(this.state, score));
  }

  resolveShootoff(): LaneControl {
    return this.with(ShootoffOps.resolveShootoff(this.state));
  }

  // ---------------------------------------------------------------------------
  // Player management
  // ---------------------------------------------------------------------------

  assignPlayer(player: Player, relayNumber?: number): LaneControl {
    return this.with({
      player,
      relayNumber: relayNumber ?? this.state.relayNumber,
    });
  }

  withConfig(config: RoundConfig): LaneControl {
    if (this.state.phase !== 'IDLE') {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: 'Cannot change config after competition has started',
      });
    }
    return new LaneControl({
      ...this.state,
      config,
    });
  }

  clearPlayer(): LaneControl {
    if (this.state.phase !== 'IDLE' && this.state.phase !== 'FINISHED') {
      throw new DomainError(ErrorCatalog.COMPETITION.INVALID_PHASE_TRANSITION, {
        messageOverride: 'Cannot clear player during active competition',
      });
    }
    return new LaneControl({
      id: this.state.id,
      channel: this.state.channel,
      player: null,
      config: this.state.config,
      phase: 'IDLE',
      stageIndex: 0,
      seriesIndex: 0,
      shotSlotInSeries: 0,
      timer: null,
      preparationShots: [],
      matchShots: [],
      shootoffShots: [],
      eliminated: false,
      eliminationRank: null,
      lastShotTime: null,
      relayNumber: this.state.relayNumber,
      lastReceivedShotNumber: null,
      matchShotsAtSeriesStart: 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Shot editing (delegated to ShotEditor pure functions)
  // ---------------------------------------------------------------------------

  updateShot(shotIndex: number, newScore: number, shotType: 'PREPARATION' | 'MATCH'): LaneControl {
    return this.with(ShotEditor.updateShot(this.state, shotIndex, newScore, shotType));
  }

  removeShot(shotIndex: number, shotType: 'PREPARATION' | 'MATCH'): LaneControl {
    return this.with(ShotEditor.removeShot(this.state, shotIndex, shotType));
  }

  insertShot(shotIndex: number, score: number, shotType: 'PREPARATION' | 'MATCH'): LaneControl {
    return this.with(ShotEditor.insertShot(this.state, shotIndex, score, shotType));
  }

  transferDataFrom(source: LaneControl): LaneControl {
    return new LaneControl({
      id: this.state.id,
      channel: this.state.channel,
      player: source.player,
      config: this.state.config,
      phase: source.phase,
      stageIndex: source.stageIndex,
      seriesIndex: source.seriesIndex,
      shotSlotInSeries: source.shotSlotInSeries,
      timer: source.timer,
      preparationShots: source.preparationShots,
      matchShots: source.matchShots,
      shootoffShots: source.shootoffShots,
      eliminated: source.eliminated,
      eliminationRank: source.eliminationRank,
      lastShotTime: source.lastShotTime,
      relayNumber: source.relayNumber,
      lastReceivedShotNumber: null,
      matchShotsAtSeriesStart: source.state.matchShotsAtSeriesStart,
    });
  }

  // ---------------------------------------------------------------------------
  // Duplicate shot detection
  // ---------------------------------------------------------------------------

  isDuplicateShot(receivedShotNumber: number): boolean {
    return this.state.lastReceivedShotNumber !== null && receivedShotNumber === this.state.lastReceivedShotNumber;
  }

  // ---------------------------------------------------------------------------
  // Button enable conditions (delegated to ButtonConditions pure functions)
  // ---------------------------------------------------------------------------

  get canStartPreparation(): boolean {
    return ButtonConditions.canStartPreparation(this.state);
  }
  get canAdvanceToNextStage(): boolean {
    return ButtonConditions.canAdvanceToNextStage(this.state);
  }
  get canStartMatch(): boolean {
    return ButtonConditions.canStartMatch(this.state);
  }
  get canFinish(): boolean {
    return ButtonConditions.canFinish(this.state);
  }

  // ---------------------------------------------------------------------------
  // Score getters (delegated to ScoreGetters pure functions)
  // ---------------------------------------------------------------------------

  get totalScore(): number {
    return ScoreGetters.totalScore(this.state);
  }

  getStageTotal(stageIndex: number): number {
    return ScoreGetters.stageTotal(this.state, stageIndex);
  }

  getSeriesScores(stageIdx: number, seriesIdx: number): number[] {
    return ScoreGetters.seriesScores_byIndex(this.state, stageIdx, seriesIdx);
  }

  getStageSeriesScores(stageIndex: number): number[] {
    return ScoreGetters.stageSeriesScores(this.state, stageIndex);
  }

  get currentSeriesShotCount(): number {
    return ScoreGetters.currentSeriesShotCount(this.state);
  }
  get remainingTime(): number {
    return ScoreGetters.remainingTime(this.state);
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  get seriesScores(): number[] {
    return ScoreGetters.seriesScores(this.state);
  }
  get lastScore(): number | null {
    return ScoreGetters.lastScore(this.state);
  }
  get recentShots(): number[] {
    return ScoreGetters.recentShots(this.state);
  }
  get displayShots(): Shot[] {
    return ScoreGetters.displayShots(this.state);
  }
  get displayShotCount(): number {
    return ScoreGetters.displayShotCount(this.state);
  }
  get displayTotalScore(): number {
    return ScoreGetters.displayTotalScore(this.state);
  }
  get displaySeriesWindow(): number[] {
    return ScoreGetters.displaySeriesWindow(this.state);
  }
  get displaySeriesScores(): number[] {
    return ScoreGetters.displaySeriesScores(this.state);
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------

  get stage1Total(): number {
    return ScoreGetters.stage1Total(this.state);
  }
  get stage2Total(): number {
    return ScoreGetters.stage2Total(this.state);
  }
  get stage1Shots(): Shot[] {
    return ScoreGetters.stage1Shots(this.state);
  }
  get stage2Shots(): Shot[] {
    return ScoreGetters.stage2Shots(this.state);
  }
  get allMatchShots(): Shot[] {
    return ScoreGetters.allMatchShots(this.state);
  }
}
