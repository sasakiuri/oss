// SPDX-License-Identifier: MIT
import {
  AssignAthleteCommandSchema,
  JoinCompetitionCommandSchema,
  LeaveCompetitionCommandSchema,
  ResetSessionCommandSchema,
  type MqttCommandActionOf,
} from '@sasakiuri/saika-protocol/commands';
import {
  CompetitionStatePayloadSchema,
  type CompetitionStatePayload,
} from '@sasakiuri/saika-protocol/CompetitionState';
import type { Athlete } from '@sasakiuri/saika-protocol/LaneAssignment';
import { Logger } from '@/shared/logging';

import { CompetitionDefinitionCompatibilityPolicy } from '../domain/CompetitionDefinitionCompatibilityPolicy';

import type { CompetitionStateRegistry } from './CompetitionStateRegistry';
import type { DirectorCommandPort } from './DirectorCommandPort';
import type { CommandBatchResult, CommandExecutionResult, CreateCompetitionInput } from './DirectorMqttTypes';
import { createLaneCommandFailure, fanOutLaneCommands } from './laneCommandBatch';

const logger = Logger.create('CompetitionMembershipCommands');

type MembershipCommandAction = Extract<MqttCommandActionOf<'lane'>, 'join-competition' | 'leave-competition'>;

export type CompetitionMembershipState = Pick<
  CompetitionStateRegistry,
  | 'requireCompetition'
  | 'requireCompetitionPhase'
  | 'requireCompetitionLane'
  | 'getLane'
  | 'assertConnected'
  | 'assertLanesAvailableForCompetition'
  | 'updateCompetitionState'
  | 'publishCompetitionState'
  | 'retainCompetitionState'
  | 'activate'
>;

export interface CompetitionMembershipContext {
  clearCompetitionShotHistory(competitionId: string, laneId: string): void;
  onResult(result: CommandExecutionResult): void;
}

/** Competition creation, Lane membership and per-Lane setup; the coordinator runs each in the competition queue. */
export class CompetitionMembershipCommands {
  private readonly definitionCompatibilityPolicy = new CompetitionDefinitionCompatibilityPolicy();

  constructor(
    private readonly commands: DirectorCommandPort,
    private readonly competitions: CompetitionMembershipState,
    private readonly context: CompetitionMembershipContext,
  ) {}

  async createCompetition(input: CreateCompetitionInput, competitionId: string): Promise<CompetitionStatePayload> {
    this.competitions.assertConnected();
    const now = new Date().toISOString();
    const state = CompetitionStatePayloadSchema.parse({
      ...input,
      competitionId,
      phase: 'NOT_STARTED',
      startedAt: null,
      finishedAt: null,
      publishedAt: now,
    });
    this.competitions.assertLanesAvailableForCompetition(state.competitionId, state.laneIds);

    await this.competitions.publishCompetitionState(state);
    this.competitions.activate(state.competitionId);
    return state;
  }

  async joinCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    const state = this.competitions.requireCompetitionPhase(competitionId, 'NOT_STARTED', 'join competition');
    const uniqueLaneIds = [...new Set(laneIds)];
    this.competitions.assertLanesAvailableForCompetition(competitionId, uniqueLaneIds);
    this.assertDefinitionCompatibility(state, uniqueLaneIds);
    const previousPendingJoinLaneIds = new Set(state.pendingJoinLaneIds ?? []);
    const provisionalPendingJoinLaneIds = [
      ...new Set([...previousPendingJoinLaneIds, ...uniqueLaneIds.filter((laneId) => !state.laneIds.includes(laneId))]),
    ];
    const provisional = this.competitions.updateCompetitionState(state, {
      laneIds: [...new Set([...state.laneIds, ...uniqueLaneIds])],
      pendingJoinLaneIds: provisionalPendingJoinLaneIds.length > 0 ? provisionalPendingJoinLaneIds : undefined,
      // No Lane can have applied an intent that outlived an empty membership.
      // This also repairs stale retained state written by earlier versions.
      ...(state.laneIds.length === 0 ? { pendingTimer: undefined } : {}),
    });
    await this.competitions.publishCompetitionState(provisional);

    const result = await this.publishMembershipCommands(competitionId, uniqueLaneIds, 'join-competition');

    const requestedLaneIds = new Set(uniqueLaneIds);
    const outcomeByLaneId = new Map(
      result.commands.flatMap((command) => command.lanes.map((lane) => [lane.laneId, lane] as const)),
    );
    const ambiguousLaneIds = provisionalPendingJoinLaneIds.filter((laneId) => {
      if (!requestedLaneIds.has(laneId)) return true;
      const outcome = outcomeByLaneId.get(laneId);
      return !outcome || outcome.status === 'timeout' || outcome.error?.code === 'MQTT_PUBLISH_FAILED';
    });
    const rejectedLaneIds = new Set(
      provisionalPendingJoinLaneIds.filter((laneId) => {
        if (!requestedLaneIds.has(laneId)) return false;
        const outcome = outcomeByLaneId.get(laneId);
        return outcome?.status === 'error' && outcome.error?.code !== 'MQTT_PUBLISH_FAILED';
      }),
    );
    await this.competitions.retainCompetitionState(provisional, {
      laneIds: provisional.laneIds.filter((laneId) => !rejectedLaneIds.has(laneId)),
      pendingJoinLaneIds: ambiguousLaneIds.length > 0 ? ambiguousLaneIds : undefined,
    });

    return result;
  }

  async leaveCompetition(competitionId: string, laneIds: string[]): Promise<CommandBatchResult> {
    const state = this.competitions.requireCompetition(competitionId);
    const uniqueLaneIds = [...new Set(laneIds)];
    uniqueLaneIds.forEach((laneId) => this.competitions.requireCompetitionLane(competitionId, laneId));
    const pendingSightingLaneIds = new Set(state.pendingSightingLaneIds ?? []);
    const canLeave =
      state.phase === 'NOT_STARTED' ||
      (state.phase === 'SIGHTING' && uniqueLaneIds.every((laneId) => pendingSightingLaneIds.has(laneId)));
    if (!canLeave) {
      throw new Error(
        `Cannot leave competition ${competitionId} while it is in phase ${state.phase}; only Lanes still pending sighting may leave after the competition starts`,
      );
    }
    const result = await this.publishMembershipCommands(competitionId, uniqueLaneIds, 'leave-competition');

    const leftLaneIds = new Set(
      result.commands
        .filter((command) => command.success)
        .flatMap((command) => command.lanes.map((lane) => lane.laneId)),
    );
    const remainingLaneIds = state.laneIds.filter((laneId) => !leftLaneIds.has(laneId));
    const remainingPendingJoinLaneIds = state.pendingJoinLaneIds?.filter((laneId) => !leftLaneIds.has(laneId));
    const remainingPendingSightingLaneIds = state.pendingSightingLaneIds?.filter((laneId) => !leftLaneIds.has(laneId));
    await this.competitions.retainCompetitionState(state, {
      laneIds: remainingLaneIds,
      ...(state.pendingJoinLaneIds
        ? {
            pendingJoinLaneIds:
              remainingPendingJoinLaneIds && remainingPendingJoinLaneIds.length > 0
                ? remainingPendingJoinLaneIds
                : undefined,
          }
        : {}),
      // Reusing an ambiguous timer deadline is necessary only while at least
      // one Lane that could have applied it remains in the competition.
      ...(remainingLaneIds.length === 0 ? { pendingTimer: undefined } : {}),
      ...(state.pendingSightingLaneIds
        ? {
            pendingSightingLaneIds:
              remainingPendingSightingLaneIds && remainingPendingSightingLaneIds.length > 0
                ? remainingPendingSightingLaneIds
                : undefined,
          }
        : {}),
    });
    return result;
  }

  async assignAthlete(competitionId: string, laneId: string, athlete: Athlete | null): Promise<CommandExecutionResult> {
    this.requireAthleteAssignmentAllowed(competitionId);
    this.competitions.requireCompetitionLane(competitionId, laneId);
    const command = AssignAthleteCommandSchema.parse(this.commands.commandBase({ athlete }));
    return this.commands.publishCompetitionLaneCommand(competitionId, laneId, 'assign-athlete', command);
  }

  async resetSession(competitionId: string, laneId: string, reason?: string): Promise<CommandExecutionResult> {
    this.competitions.requireCompetitionPhase(competitionId, 'NOT_STARTED', 'reset a session');
    this.competitions.requireCompetitionLane(competitionId, laneId);
    const command = ResetSessionCommandSchema.parse(this.commands.commandBase({ ...(reason ? { reason } : {}) }));
    const result = await this.commands.publishCompetitionLaneCommand(competitionId, laneId, 'reset-session', command);
    const scopedResult: CommandExecutionResult = { ...result, competitionId };
    this.context.onResult(scopedResult);
    if (result.success) this.context.clearCompetitionShotHistory(competitionId, laneId);
    return scopedResult;
  }

  /** A command that cannot be published becomes that Lane's failure, keyed by the command it would have sent. */
  publishMembershipCommands(
    competitionId: string,
    laneIds: readonly string[],
    action: MembershipCommandAction,
  ): Promise<CommandBatchResult> {
    const schema = action === 'join-competition' ? JoinCompetitionCommandSchema : LeaveCompetitionCommandSchema;
    const commandIds = new Map<string, string>();
    return fanOutLaneCommands(
      laneIds,
      async (laneId) => {
        const command = schema.parse(this.commands.commandBase({ competitionId }));
        commandIds.set(laneId, command.commandId);
        return this.commands.publishLaneCommand(laneId, action, command);
      },
      (laneId, error) => {
        const result = createLaneCommandFailure({
          commandId: commandIds.get(laneId),
          action,
          laneId,
          code: 'MQTT_PUBLISH_FAILED',
          error,
        });
        this.context.onResult(result);
        return result;
      },
    );
  }

  private assertDefinitionCompatibility(state: CompetitionStatePayload, laneIds: readonly string[]): void {
    for (const laneId of laneIds) {
      const assessment = this.definitionCompatibilityPolicy.assess(
        state.definitionBinding,
        this.competitions.getLane(laneId)?.hardware?.capabilities,
      );
      if (!assessment.joinAllowed) {
        throw new Error(`Lane ${laneId} cannot join competition ${state.competitionId}: ${assessment.guidance}`);
      }
      if (assessment.status !== 'MATCH' && assessment.status !== 'DISABLED' && assessment.status !== 'LEGACY') {
        logger.warn(`Lane ${laneId} has advisory Rule Pack compatibility: ${assessment.guidance}`);
      }
    }
  }

  private requireAthleteAssignmentAllowed(competitionId: string): void {
    const state = this.competitions.requireCompetition(competitionId);
    const canRepairUnpublishedResults = state.phase === 'MATCH_COMPLETE' && !state.cleanupPreparedAt;
    if (state.phase !== 'NOT_STARTED' && !canRepairUnpublishedResults) {
      throw new Error(
        `Cannot change athlete assignments while competition ${competitionId} is in phase ${state.phase}`,
      );
    }
  }
}
