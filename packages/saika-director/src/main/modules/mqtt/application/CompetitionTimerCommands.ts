// SPDX-License-Identifier: MIT
import type {
  ActiveCompetitionTimer,
  CompetitionStatePayload,
  PendingCompetitionTimer,
} from '@sasakiuri/saika-protocol/CompetitionState';

import type { FiringBoundarySignal } from '../domain/IFiringWindowJournal';

import {
  prepareCompetitionBroadcast,
  type CompetitionBroadcastAction,
  type CompetitionBroadcastFields,
} from './competitionBroadcasts';
import type { CompetitionStateRegistry } from './CompetitionStateRegistry';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandExecutionResult } from './DirectorMqttTypes';

export type CompetitionTimerState = Pick<
  CompetitionStateRegistry,
  | 'requireCompetition'
  | 'requireCompetitionPhase'
  | 'requireCompetitionLane'
  | 'assertPhaseStartAllowed'
  | 'assertSafetyCleared'
  | 'assertTimedCommandReadiness'
  | 'updateCompetitionState'
  | 'publishCompetitionState'
  | 'retainCompetitionState'
>;

/** The coordinator's timer deadlines; a broadcast that ends a timer suspends them until it succeeds. */
export interface CompetitionTimerDeadlines {
  clear(competitionId: string): void;
  restore(state: CompetitionStatePayload): void;
}

export interface CompetitionTimerContext {
  readonly deadlines: CompetitionTimerDeadlines;
  onFiringBoundary(boundary: FiringBoundarySignal): void;
}

export interface NextSeriesTimer {
  durationSeconds: number;
  stageIndex: number;
  seriesIndex: number;
}

/**
 * Sighting and MATCH phases, generic timers and series changes broadcast to every joined Lane; the
 * coordinator runs each in the competition queue.
 */
export class CompetitionTimerCommands {
  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly competitions: CompetitionTimerState,
    private readonly context: CompetitionTimerContext,
    private readonly startDelayMs: number,
  ) {}

  async startSighting(
    competitionId: string,
    durationSeconds: number,
    targetLaneIds?: string[],
  ): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetition(competitionId);
    const isTargetedContinuation = state.phase === 'SIGHTING' && targetLaneIds !== undefined;
    if (state.phase !== 'NOT_STARTED' && !isTargetedContinuation) {
      throw new Error(`Cannot start sighting while competition ${competitionId} is in phase ${state.phase}`);
    }
    const pendingJoinLaneCount = state.pendingJoinLaneIds?.length ?? 0;
    if (pendingJoinLaneCount > 0) {
      throw new Error(
        `Cannot start sighting while ${pendingJoinLaneCount} Lane(s) have unconfirmed competition membership`,
      );
    }
    const expectedLaneIds = targetLaneIds ?? state.laneIds;
    if (expectedLaneIds.length === 0) {
      throw new Error('Cannot start sighting for a competition with no joined Lanes');
    }
    expectedLaneIds.forEach((laneId) => this.competitions.requireCompetitionLane(competitionId, laneId));
    this.competitions.assertPhaseStartAllowed({ competitionId, phase: 'SIGHTING', laneIds: expectedLaneIds });
    this.competitions.assertSafetyCleared(expectedLaneIds, 'start sighting');
    this.competitions.assertTimedCommandReadiness(expectedLaneIds);
    let commandState = state;
    let activeTimer: ActiveCompetitionTimer;
    if (isTargetedContinuation && state.activeTimer) {
      activeTimer = state.activeTimer;
    } else {
      const prepared = await this.retainTimerIntent(state, 'start-sighting', {
        timerScope: 'STAGE',
        timerStartAt:
          isTargetedContinuation && state.startedAt
            ? state.startedAt
            : new Date(Date.now() + this.startDelayMs).toISOString(),
        timerDurationSeconds: durationSeconds,
        stageIndex: 0,
        seriesIndex: null,
      });
      commandState = prepared.state;
      activeTimer = prepared.timer;
    }
    const result = await this.publishBroadcast(
      competitionId,
      'start-sighting',
      {
        timerStartAt: activeTimer.timerStartAt,
        timerDurationSeconds: activeTimer.timerDurationSeconds,
        ...(targetLaneIds ? { targetLaneIds } : {}),
      },
      expectedLaneIds,
    );
    const completedLaneIds = new Set(result.lanes.filter((lane) => lane.status === 'done').map((lane) => lane.laneId));
    if (state.phase === 'SIGHTING' || completedLaneIds.size > 0) {
      const pendingCandidates =
        state.phase === 'NOT_STARTED' ? state.laneIds : (state.pendingSightingLaneIds ?? expectedLaneIds);
      const pendingSightingLaneIds = [
        ...new Set([
          ...pendingCandidates.filter((laneId) => !completedLaneIds.has(laneId)),
          ...result.lanes.filter((lane) => lane.status !== 'done').map((lane) => lane.laneId),
        ]),
      ];
      await this.competitions.retainCompetitionState(commandState, {
        phase: 'SIGHTING',
        startedAt: state.startedAt ?? activeTimer.timerStartAt,
        activeTimer,
        pendingTimer: undefined,
        pendingSightingLaneIds: pendingSightingLaneIds.length > 0 ? pendingSightingLaneIds : undefined,
      });
    }
    return result;
  }

  async stopActiveTimer(competitionId: string): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetition(competitionId);
    if ((state.phase !== 'SIGHTING' && state.phase !== 'MATCH') || !state.activeTimer) {
      throw new Error(`Competition ${competitionId} has no active firing timer to stop`);
    }
    this.context.deadlines.clear(competitionId);
    const activeTimer = state.activeTimer;
    try {
      const result = await this.publishBroadcast(competitionId, 'timer-expired', {
        timerScope: activeTimer.timerScope,
        stageIndex: activeTimer.stageIndex,
        seriesIndex: activeTimer.seriesIndex,
        expiredAt: new Date().toISOString(),
      });
      if (result.success) {
        await this.competitions.retainCompetitionState(state, { activeTimer: undefined });
      } else {
        this.context.deadlines.restore(state);
      }
      return result;
    } catch (error) {
      this.context.deadlines.restore(state);
      throw error;
    }
  }

  async endSighting(competitionId: string): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetitionPhase(competitionId, 'SIGHTING', 'end sighting');
    const pendingSightingLaneCount = state.pendingSightingLaneIds?.length ?? 0;
    if (pendingSightingLaneCount > 0) {
      throw new Error(`Cannot end sighting while ${pendingSightingLaneCount} Lane(s) have not started sighting`);
    }
    this.context.deadlines.clear(competitionId);
    let result: CommandExecutionResult;
    try {
      result = await this.publishBroadcast(competitionId, 'end-sighting', {});
    } catch (error) {
      this.context.deadlines.restore(state);
      throw error;
    }
    if (result.success) {
      await this.competitions.retainCompetitionState(state, {
        phase: 'SIGHTING_COMPLETE',
        activeTimer: undefined,
        pendingTimer: undefined,
        pendingSightingLaneIds: undefined,
      });
    } else {
      this.context.deadlines.restore(state);
    }
    return result;
  }

  async startMatch(competitionId: string, durationSeconds?: number): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetitionPhase(competitionId, 'SIGHTING_COMPLETE', 'start match');
    // With no generic timer, MATCH only arms the enclosing phase; the target program opens firing later.
    if (durationSeconds !== undefined)
      this.competitions.assertPhaseStartAllowed({ competitionId, phase: 'MATCH', laneIds: state.laneIds });
    this.competitions.assertSafetyCleared(state.laneIds, 'start match');
    this.competitions.assertTimedCommandReadiness(state.laneIds);
    if (durationSeconds === undefined) {
      const timerStartAt = new Date(Date.now() + this.startDelayMs).toISOString();
      const result = await this.publishBroadcast(competitionId, 'start-match', { timerStartAt });
      if (result.success) {
        await this.competitions.retainCompetitionState(state, {
          phase: 'MATCH',
          startedAt: state.startedAt ?? timerStartAt,
          activeTimer: undefined,
          pendingTimer: undefined,
        });
      }
      return result;
    }
    const prepared = await this.retainTimerIntent(state, 'start-match', {
      timerScope: 'STAGE',
      timerStartAt: new Date(Date.now() + this.startDelayMs).toISOString(),
      timerDurationSeconds: durationSeconds,
      stageIndex: 1,
      seriesIndex: null,
    });
    const activeTimer = prepared.timer;
    const result = await this.publishBroadcast(competitionId, 'start-match', {
      timerStartAt: activeTimer.timerStartAt,
      timerDurationSeconds: activeTimer.timerDurationSeconds,
    });
    if (result.success) {
      await this.competitions.retainCompetitionState(prepared.state, {
        phase: 'MATCH',
        startedAt: state.startedAt ?? activeTimer.timerStartAt,
        activeTimer,
        pendingTimer: undefined,
      });
    }
    return result;
  }

  async restartTimer(
    competitionId: string,
    timerScope: 'STAGE' | 'SERIES',
    durationSeconds: number,
    stageIndex: number,
    seriesIndex: number | null,
  ): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetition(competitionId);
    if (state.phase !== 'SIGHTING' && state.phase !== 'MATCH') {
      throw new Error(`Cannot restart timer while competition ${competitionId} is in phase ${state.phase}`);
    }
    this.competitions.assertSafetyCleared(state.laneIds, 'restart a timer');
    this.competitions.assertTimedCommandReadiness(state.laneIds);
    const prepared = await this.retainTimerIntent(state, 'timer-started', {
      timerScope,
      timerStartAt: new Date(Date.now() + this.startDelayMs).toISOString(),
      timerDurationSeconds: durationSeconds,
      stageIndex,
      seriesIndex,
    });
    const activeTimer = prepared.timer;
    const result = await this.publishBroadcast(competitionId, 'timer-started', {
      timerScope: activeTimer.timerScope,
      timerStartAt: activeTimer.timerStartAt,
      timerDurationSeconds: activeTimer.timerDurationSeconds,
      stageIndex: activeTimer.stageIndex,
      seriesIndex: activeTimer.seriesIndex,
    });
    if (result.success) {
      await this.competitions.retainCompetitionState(prepared.state, { activeTimer, pendingTimer: undefined });
    }
    return result;
  }

  async advanceSeries(
    competitionId: string,
    stageIndex: number,
    fromSeriesIndex: number,
    resumeOnly?: boolean,
    nextSeriesTimer?: NextSeriesTimer,
  ): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetitionPhase(competitionId, 'MATCH', 'advance series');
    this.competitions.assertSafetyCleared(state.laneIds, 'advance series');
    if (nextSeriesTimer) this.competitions.assertTimedCommandReadiness(state.laneIds);
    const timerStartAt = nextSeriesTimer ? new Date(Date.now() + this.startDelayMs).toISOString() : undefined;
    const result = await this.publishBroadcast(competitionId, 'advance-series', {
      stageIndex,
      fromSeriesIndex,
      ...(resumeOnly === undefined ? {} : { resumeOnly }),
      ...(nextSeriesTimer ? { timerStartAt, timerDurationSeconds: nextSeriesTimer.durationSeconds } : {}),
    });
    if (result.success) {
      const activeTimer =
        nextSeriesTimer && timerStartAt
          ? {
              timerScope: 'SERIES' as const,
              timerStartAt,
              timerDurationSeconds: nextSeriesTimer.durationSeconds,
              stageIndex: nextSeriesTimer.stageIndex,
              seriesIndex: nextSeriesTimer.seriesIndex,
            }
          : undefined;
      await this.competitions.retainCompetitionState(state, { activeTimer, pendingTimer: undefined });
    }
    return result;
  }

  /** Broadcasts to the joined Lanes, or to `expectedLaneIds`, and records any firing boundary once published. */
  async publishBroadcast<Action extends CompetitionBroadcastAction>(
    competitionId: string,
    action: Action,
    fields: CompetitionBroadcastFields<Action>,
    expectedLaneIds?: readonly string[],
  ): Promise<CommandExecutionResult> {
    const state = this.competitions.requireCompetition(competitionId);
    const { command, firingBoundary } = prepareCompetitionBroadcast(
      competitionId,
      state.phase,
      action,
      this.commands.commandBase(fields),
    );
    return this.commands.publishCompetitionCommand(
      competitionId,
      action,
      command,
      expectedLaneIds ?? state.laneIds,
      firingBoundary ? () => this.context.onFiringBoundary(firingBoundary) : undefined,
    );
  }

  private async retainTimerIntent(
    state: CompetitionStatePayload,
    action: PendingCompetitionTimer['action'],
    requestedTimer: ActiveCompetitionTimer,
  ): Promise<{ state: CompetitionStatePayload; timer: ActiveCompetitionTimer }> {
    const existing = state.pendingTimer;
    const pendingTimer: PendingCompetitionTimer =
      existing && timerIntentMatches(existing, action, requestedTimer)
        ? existing
        : {
            action,
            ...requestedTimer,
          };

    if (pendingTimer === existing) {
      return { state, timer: activeTimerFromIntent(pendingTimer) };
    }

    const preparedState = this.competitions.updateCompetitionState(state, { pendingTimer });
    await this.competitions.publishCompetitionState(preparedState);
    return { state: preparedState, timer: activeTimerFromIntent(pendingTimer) };
  }
}

function timerIntentMatches(
  intent: PendingCompetitionTimer,
  action: PendingCompetitionTimer['action'],
  requestedTimer: ActiveCompetitionTimer,
): boolean {
  // A retry may arrive with a different duration after an ambiguous failure.
  // Preserve both the original deadline and duration for the same timer target;
  // some Lanes may already have applied them even when Director lost the ACK.
  return (
    intent.action === action &&
    intent.timerScope === requestedTimer.timerScope &&
    intent.stageIndex === requestedTimer.stageIndex &&
    intent.seriesIndex === requestedTimer.seriesIndex
  );
}

function activeTimerFromIntent(intent: PendingCompetitionTimer): ActiveCompetitionTimer {
  return {
    timerScope: intent.timerScope,
    timerStartAt: intent.timerStartAt,
    timerDurationSeconds: intent.timerDurationSeconds,
    stageIndex: intent.stageIndex,
    seriesIndex: intent.seriesIndex,
  };
}
