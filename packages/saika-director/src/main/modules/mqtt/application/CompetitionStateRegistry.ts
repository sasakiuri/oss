// SPDX-License-Identifier: MIT
import type { CompetitionStartScope } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import {
  CompetitionStatePayloadSchema,
  type CompetitionPhase,
  type CompetitionStatePayload,
} from '@sasakiuri/saika-protocol/CompetitionState';
import { mqttTopics } from '@sasakiuri/saika-protocol/topics';

import type { IMqttTransport } from '../domain/IMqttTransport';

import type { CompetitionExpiryScheduler } from './CompetitionExpiryScheduler';
import type { DirectorLaneReadiness } from './DirectorLaneReadiness';
import type { DirectorMqttConnection } from './DirectorMqttConnection';
import type { DirectorMqttState } from './DirectorMqttState';
import type { DirectorLaneSnapshot, DirectorMqttCallbacks } from './DirectorMqttTypes';

type CompetitionStatePatch = Partial<
  Pick<
    CompetitionStatePayload,
    | 'laneIds'
    | 'transferredSourceLaneIds'
    | 'pendingJoinLaneIds'
    | 'pendingSightingLaneIds'
    | 'phase'
    | 'startedAt'
    | 'finishedAt'
    | 'activeTimer'
    | 'pendingTimer'
    | 'cleanupPreparedAt'
  >
>;

interface CompetitionStateRegistryDependencies {
  readonly state: DirectorMqttState;
  readonly readiness: Pick<DirectorLaneReadiness, 'assertTimedCommandReadiness' | 'assertTimedTargetReadiness'>;
  readonly expiry: Pick<CompetitionExpiryScheduler, 'restore' | 'clear'>;
  readonly connection: Pick<DirectorMqttConnection, 'assertConnected' | 'ready'>;
  readonly transport: Pick<IMqttTransport, 'publish'>;
  readonly callbacks: Pick<DirectorMqttCallbacks, 'assertPhaseStartAllowed'>;
  onStateChanged(): void;
}

/**
 * The competition states Director retains on the broker, and the preconditions control workflows
 * check against them before sending a command.
 */
export class CompetitionStateRegistry {
  private activeId: string | null = null;
  private readonly cleanupLaneIdsByCompetition = new Map<string, string[]>();

  constructor(private readonly dependencies: CompetitionStateRegistryDependencies) {}

  get activeCompetitionId(): string | null {
    return this.activeId;
  }

  requireCompetition(competitionId: string): CompetitionStatePayload {
    const state = this.dependencies.state.getCompetition(competitionId);
    if (!state) throw new Error(`MQTT competition not found: ${competitionId}`);
    return state;
  }

  requireCompetitionPhase(competitionId: string, phase: CompetitionPhase, operation: string): CompetitionStatePayload {
    const state = this.requireCompetition(competitionId);
    if (state.phase !== phase) {
      throw new Error(`Cannot ${operation} while competition ${competitionId} is in phase ${state.phase}`);
    }
    return state;
  }

  requireCompetitionLane(competitionId: string, laneId: string): void {
    const state = this.requireCompetition(competitionId);
    if (!state.laneIds.includes(laneId)) {
      throw new Error(`Lane ${laneId} is not joined to competition ${competitionId}`);
    }
  }

  getLane(laneId: string): DirectorLaneSnapshot | undefined {
    return this.dependencies.state.getLane(laneId);
  }

  assertConnected(): void {
    this.dependencies.connection.assertConnected();
  }

  assertSafetyCleared(laneIds: readonly string[], operation: string): void {
    const stopped = laneIds.filter((laneId) => this.getLane(laneId)?.safetyState?.status === 'STOPPED');
    if (stopped.length > 0) {
      throw new Error(`Cannot ${operation}; safety STOP is active on Lane(s): ${stopped.join(', ')}`);
    }
  }

  assertTimedCommandReadiness(laneIds: readonly string[]): void {
    this.dependencies.readiness.assertTimedCommandReadiness(laneIds);
  }

  assertTimedTargetReadiness(laneIds: readonly string[]): void {
    this.dependencies.readiness.assertTimedTargetReadiness(laneIds);
  }

  assertPhaseStartAllowed(scope: CompetitionStartScope): void {
    this.dependencies.callbacks.assertPhaseStartAllowed?.(scope);
  }

  assertLanesAvailableForCompetition(competitionId: string, laneIds: readonly string[]): void {
    for (const laneId of laneIds) {
      const conflictingCompetition = this.dependencies.state
        .getCompetitions()
        .find((competition) => competition.competitionId !== competitionId && competition.laneIds.includes(laneId));
      if (conflictingCompetition) {
        throw new Error(
          `Lane ${laneId} is already joined to competition ${conflictingCompetition.competitionId} (${conflictingCompetition.competitionTypeId})`,
        );
      }
    }
  }

  updateCompetitionState(state: CompetitionStatePayload, patch: CompetitionStatePatch): CompetitionStatePayload {
    return CompetitionStatePayloadSchema.parse({
      ...state,
      ...patch,
      publishedAt: new Date().toISOString(),
    });
  }

  async publishCompetitionState(state: CompetitionStatePayload): Promise<void> {
    this.assertConnected();
    const validated = CompetitionStatePayloadSchema.parse(state);
    await this.dependencies.transport.publish(
      mqttTopics.competitionState(validated.competitionId),
      JSON.stringify(validated),
      { qos: 1, retain: true },
    );
    this.dependencies.state.setCompetition(validated);
    this.dependencies.expiry.restore(validated);
    this.refreshProjection();
  }

  /** Publishes the retained competition state with the patch applied. */
  retainCompetitionState(state: CompetitionStatePayload, patch: CompetitionStatePatch): Promise<void> {
    return this.publishCompetitionState(this.updateCompetitionState(state, patch));
  }

  /** Selects a competition this Director has just created. */
  activate(competitionId: string): void {
    this.activeId = competitionId;
    this.refreshProjection();
  }

  /** Records a retained competition state delivered by the broker; the latest publication becomes active. */
  observe(state: CompetitionStatePayload): void {
    this.dependencies.state.setCompetition(state);
    if (this.dependencies.connection.ready) this.dependencies.expiry.restore(state);
    if (
      !this.activeId ||
      Date.parse(state.publishedAt) >=
        Date.parse(this.dependencies.state.getCompetition(this.activeId)?.publishedAt ?? '1970-01-01')
    )
      this.activeId = state.competitionId;
    this.refreshProjection();
  }

  /** The Lanes to release when the competition is finished, fixed by the first cleanup attempt. */
  getCleanupLaneIds(competitionId: string): string[] {
    const state = this.requireCompetition(competitionId);
    const existing = this.cleanupLaneIdsByCompetition.get(competitionId);
    if (existing) return [...existing];

    const laneIds = [...new Set(state.laneIds)];
    this.cleanupLaneIdsByCompetition.set(competitionId, laneIds);
    return [...laneIds];
  }

  /** Clears every retained topic of a finished competition, then forgets it. */
  async clearRetainedState(competitionId: string, laneIds: readonly string[]): Promise<void> {
    const { transport } = this.dependencies;
    const retainedTopics = laneIds.flatMap((laneId) => [
      mqttTopics.laneCompetitionState(competitionId, laneId),
      mqttTopics.laneScore(competitionId, laneId),
      mqttTopics.laneAssignment(competitionId, laneId),
      mqttTopics.timedTargetState(competitionId, laneId),
    ]);
    retainedTopics.push(mqttTopics.competitionCue(competitionId));
    const outcomes = await Promise.allSettled(
      retainedTopics.map((topic) => transport.publish(topic, '', { qos: 1, retain: true })),
    );

    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
    if (rejected.length > 0) {
      throw new Error(`Failed to clear ${rejected.length} retained MQTT competition topic(s)`);
    }

    try {
      await transport.publish(mqttTopics.competitionState(competitionId), '', { qos: 1, retain: true });
    } catch {
      throw new Error('Failed to clear 1 retained MQTT competition topic(s)');
    }

    this.forget(competitionId);
  }

  /** Drops a cleared competition from the read model, its expiry timer and its cleanup Lanes. */
  forget(competitionId: string): void {
    this.dependencies.state.removeCompetition(competitionId);
    this.cleanupLaneIdsByCompetition.delete(competitionId);
    this.dependencies.expiry.clear(competitionId);
    if (this.activeId === competitionId) this.activeId = this.dependencies.state.getMostRecentCompetitionId();
    this.refreshProjection();
  }

  reset(): void {
    this.activeId = null;
    this.cleanupLaneIdsByCompetition.clear();
  }

  private refreshProjection(): void {
    this.dependencies.state.projectCompetitionLaneData();
    this.dependencies.onStateChanged();
  }
}
