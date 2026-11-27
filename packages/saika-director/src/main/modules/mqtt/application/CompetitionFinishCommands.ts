// SPDX-License-Identifier: MIT
import type { CompetitionMembershipCommands } from './CompetitionMembershipCommands';
import type { CompetitionStateRegistry } from './CompetitionStateRegistry';
import type { CompetitionTimerCommands, CompetitionTimerDeadlines } from './CompetitionTimerCommands';
import type {
  CommandExecutionResult,
  CompetitionLaneSnapshotRevision,
  CompetitionResultLane,
  DirectorMqttCallbacks,
} from './DirectorMqttTypes';

export type CompetitionFinishState = Pick<
  CompetitionStateRegistry,
  | 'requireCompetition'
  | 'updateCompetitionState'
  | 'publishCompetitionState'
  | 'getCleanupLaneIds'
  | 'clearRetainedState'
>;

/** Final Lane state and score publications observed after the finish broadcast. */
export interface FinalLaneSnapshots {
  captureCompetitionLaneSnapshotRevisions(
    competitionId: string,
    laneIds: string[],
  ): Map<string, CompetitionLaneSnapshotRevision>;
  waitForFreshFinalLaneSnapshots(
    competitionId: string,
    laneIds: string[],
    baseline: Map<string, CompetitionLaneSnapshotRevision>,
    finalSnapshotCommandId: string,
  ): Promise<Map<string, string>>;
  getCompetitionResultLanes(competitionId: string, laneIds: string[]): CompetitionResultLane[];
}

export interface CompetitionFinishContext {
  readonly callbacks: Pick<DirectorMqttCallbacks, 'assertCompetitionFinishAllowed'>;
  readonly deadlines: CompetitionTimerDeadlines;
  readonly snapshots: FinalLaneSnapshots;
  readonly timers: Pick<CompetitionTimerCommands, 'publishBroadcast'>;
  readonly membership: Pick<CompetitionMembershipCommands, 'publishMembershipCommands'>;
  onResult(result: CommandExecutionResult): void;
}

/**
 * Finishes a competition, waits for final Lane snapshots, runs result publication and releases the
 * Lanes before clearing the retained competition; the coordinator runs it in the competition queue.
 */
export class CompetitionFinishCommands {
  constructor(
    private readonly competitions: CompetitionFinishState,
    private readonly context: CompetitionFinishContext,
  ) {}

  async finishCompetition(
    competitionId: string,
    beforeCleanup?: (lanes: CompetitionResultLane[]) => Promise<boolean | void>,
    beforeDataClear?: () => Promise<void> | void,
  ): Promise<CommandExecutionResult> {
    const { deadlines, snapshots } = this.context;
    this.context.callbacks.assertCompetitionFinishAllowed?.(competitionId);
    let state = this.competitions.requireCompetition(competitionId);
    deadlines.clear(competitionId);
    const finalSnapshotBaseline =
      state.phase !== 'MATCH_COMPLETE' && beforeCleanup
        ? snapshots.captureCompetitionLaneSnapshotRevisions(competitionId, state.laneIds)
        : null;
    let result: CommandExecutionResult;
    try {
      result =
        state.phase === 'MATCH_COMPLETE'
          ? this.completedFinishResult(state.laneIds)
          : await this.context.timers.publishBroadcast(competitionId, 'finish-competition', {});
    } catch (error) {
      deadlines.restore(state);
      throw error;
    }
    if (result.success) {
      if (finalSnapshotBaseline) {
        const snapshotErrors = await snapshots.waitForFreshFinalLaneSnapshots(
          competitionId,
          state.laneIds,
          finalSnapshotBaseline,
          result.commandId,
        );
        if (snapshotErrors.size > 0) {
          const failedResult: CommandExecutionResult = {
            ...result,
            success: false,
            lanes: result.lanes.map((lane) => {
              const message = snapshotErrors.get(lane.laneId);
              return message
                ? {
                    laneId: lane.laneId,
                    status: 'error',
                    error: { code: 'MQTT_FINAL_SNAPSHOT_INCOMPLETE', message },
                  }
                : lane;
            }),
          };
          this.context.onResult(failedResult);
          return failedResult;
        }
      }

      if (state.phase !== 'MATCH_COMPLETE') {
        const finishedAt = new Date().toISOString();
        state = this.competitions.updateCompetitionState(state, {
          phase: 'MATCH_COMPLETE',
          finishedAt,
          activeTimer: undefined,
          pendingTimer: undefined,
          // With no result-publication callback there is no pre-cleanup work to
          // resume. Persist that fact in the same retained state as completion,
          // so a crash cannot expose an ambiguous completed competition that a
          // later retry might treat as eligible for result publication.
          ...(beforeCleanup || beforeDataClear ? {} : { cleanupPreparedAt: finishedAt }),
        });
        await this.competitions.publishCompetitionState(state);
      }

      const laneIds = this.competitions.getCleanupLaneIds(competitionId);
      await beforeDataClear?.();
      if (!state.cleanupPreparedAt) {
        const cleanupAllowed = await beforeCleanup?.(snapshots.getCompetitionResultLanes(competitionId, laneIds));
        if (cleanupAllowed === false) return result;

        // Lane clears its retained assignment and score before acknowledging
        // leave-competition. Persist completion of result publication (or any
        // other pre-cleanup work) first so a cleanup retry never needs data
        // that has already been removed from the broker.
        state = this.competitions.updateCompetitionState(state, {
          cleanupPreparedAt: new Date().toISOString(),
        });
        await this.competitions.publishCompetitionState(state);
      }

      // Keep the retained membership unchanged until every cleanup operation
      // succeeds. Already-left Lanes return an idempotent done result on retry.
      const leaveResult = await this.context.membership.publishMembershipCommands(
        competitionId,
        laneIds,
        'leave-competition',
      );
      if (!leaveResult.success) {
        const failedResult: CommandExecutionResult = {
          ...result,
          success: false,
          lanes: leaveResult.commands.flatMap((command) => command.lanes),
        };
        this.context.onResult(failedResult);
        return failedResult;
      }

      await this.competitions.clearRetainedState(competitionId, laneIds);
      this.context.onResult(result);
    } else {
      deadlines.restore(state);
    }
    return result;
  }

  private completedFinishResult(laneIds: string[]): CommandExecutionResult {
    const result: CommandExecutionResult = {
      commandId: crypto.randomUUID(),
      action: 'finish-competition',
      success: true,
      lanes: laneIds.map((laneId) => ({ laneId, status: 'done' })),
    };
    this.context.onResult(result);
    return result;
  }
}
