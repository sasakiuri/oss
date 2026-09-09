// SPDX-License-Identifier: MIT
import { type CompetitionShotPayload, type CompetitionStatePayload } from '@/shared/mqtt';
import type { CompetitionLaneData, CompetitionResultLane, DirectorLaneSnapshot } from './DirectorMqttTypes';

interface CompetitionLaneSnapshotRevision {
  competitionState: number;
  score: number;
}

/** Broker-scoped read model. Retained delivery order does not determine Lane ownership. */
export class DirectorMqttState {
  private readonly lanes = new Map<string, DirectorLaneSnapshot>();
  private readonly competitions = new Map<string, CompetitionStatePayload>();
  private readonly competitionLaneData = new Map<string, Map<string, CompetitionLaneData>>();
  private readonly competitionLaneSnapshotRevisions = new Map<string, Map<string, CompetitionLaneSnapshotRevision>>();
  private readonly competitionShots = new Map<string, Map<string, CompetitionShotPayload[]>>();
  private readonly seenShotIds = new Set<string>();
  private seenShotQueue: string[] = [];
  private nextCompetitionLaneSnapshotRevision = 0;
  private readonly competitionLaneSnapshotListeners = new Set<() => void>();

  constructor(
    private readonly commandTimeoutMs: number,
    private readonly onStateChanged: () => void,
  ) {}

  getLane(laneId: string): DirectorLaneSnapshot | undefined {
    return this.lanes.get(laneId);
  }
  getLanes(): DirectorLaneSnapshot[] {
    return [...this.lanes.values()];
  }
  getCompetition(competitionId: string): CompetitionStatePayload | undefined {
    return this.competitions.get(competitionId);
  }
  getCompetitions(): CompetitionStatePayload[] {
    return [...this.competitions.values()];
  }
  setCompetition(state: CompetitionStatePayload): void {
    this.competitions.set(state.competitionId, state);
  }

  removeCompetition(competitionId: string): void {
    this.competitions.delete(competitionId);
    this.competitionLaneData.delete(competitionId);
    this.competitionLaneSnapshotRevisions.delete(competitionId);
    this.competitionShots.delete(competitionId);
  }

  reset(): void {
    this.lanes.clear();
    this.competitions.clear();
    this.competitionLaneData.clear();
    this.competitionLaneSnapshotRevisions.clear();
    this.competitionShots.clear();
    this.seenShotIds.clear();
    this.seenShotQueue = [];
  }

  updateLane(laneId: string, patch: Partial<Omit<DirectorLaneSnapshot, 'laneId'>>): void {
    const current = this.getOrCreateLane(laneId);
    this.lanes.set(laneId, { ...current, ...patch });
    this.onStateChanged();
  }

  private getOrCreateLane(laneId: string): DirectorLaneSnapshot {
    return (
      this.lanes.get(laneId) ?? {
        laneId,
        laneAlias: '',
        hardware: null,
        safetyState: null,
        rangeOfficerRequest: null,
        qualificationMalfunctionSignal: null,
        estComplaintSignal: null,
        timedTargetState: null,
        qualificationRecoveryState: null,
        competitionState: null,
        assignment: null,
        score: null,
        lastRawShot: null,
        lastCompetitionShot: null,
        lastQualificationRecoveryShot: null,
        lastSeenAt: new Date(0).toISOString(),
      }
    );
  }

  updateCompetitionLane(
    competitionId: string,
    laneId: string,
    patch: Partial<CompetitionLaneData>,
    lastSeenAt?: string,
  ): void {
    let dataByLane = this.competitionLaneData.get(competitionId);
    if (!dataByLane) {
      dataByLane = new Map();
      this.competitionLaneData.set(competitionId, dataByLane);
    }
    const currentData = dataByLane.get(laneId) ?? {
      competitionState: null,
      assignment: null,
      score: null,
      lastCompetitionShot: null,
      timedTargetState: null,
      qualificationRecoveryState: null,
      lastQualificationRecoveryShot: null,
    };
    const updatedData = { ...currentData, ...patch };
    dataByLane.set(laneId, updatedData);
    this.updateCompetitionLaneSnapshotRevision(competitionId, laneId, patch);

    const currentLane = this.getOrCreateLane(laneId);
    const laneCompetitionId = this.getCompetitionIdForLane(laneId);
    this.lanes.set(laneId, {
      ...currentLane,
      ...(laneCompetitionId === competitionId ? updatedData : {}),
      ...(lastSeenAt ? { lastSeenAt } : {}),
    });
    this.onStateChanged();
    this.notifyCompetitionLaneSnapshotListeners();
  }

  private updateCompetitionLaneSnapshotRevision(
    competitionId: string,
    laneId: string,
    patch: Partial<CompetitionLaneData>,
  ): void {
    const updatesCompetitionState = Object.prototype.hasOwnProperty.call(patch, 'competitionState');
    const updatesScore = Object.prototype.hasOwnProperty.call(patch, 'score');
    if (!updatesCompetitionState && !updatesScore) return;

    let revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    if (!revisionsByLane) {
      revisionsByLane = new Map();
      this.competitionLaneSnapshotRevisions.set(competitionId, revisionsByLane);
    }
    const current = revisionsByLane.get(laneId) ?? { competitionState: 0, score: 0 };
    revisionsByLane.set(laneId, {
      competitionState: updatesCompetitionState ? ++this.nextCompetitionLaneSnapshotRevision : current.competitionState,
      score: updatesScore ? ++this.nextCompetitionLaneSnapshotRevision : current.score,
    });
  }

  captureCompetitionLaneSnapshotRevisions(
    competitionId: string,
    laneIds: string[],
  ): Map<string, CompetitionLaneSnapshotRevision> {
    const revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    return new Map(
      laneIds.map((laneId) => {
        const revision = revisionsByLane?.get(laneId) ?? { competitionState: 0, score: 0 };
        return [laneId, { ...revision }];
      }),
    );
  }

  private getFinalLaneSnapshotErrors(
    competitionId: string,
    laneIds: string[],
    baseline: Map<string, CompetitionLaneSnapshotRevision>,
    finalSnapshotCommandId: string,
  ): Map<string, string> {
    const competition = this.competitions.get(competitionId);
    const dataByLane = this.competitionLaneData.get(competitionId);
    const revisionsByLane = this.competitionLaneSnapshotRevisions.get(competitionId);
    const errors = new Map<string, string>();

    for (const laneId of laneIds) {
      const initial = baseline.get(laneId) ?? { competitionState: 0, score: 0 };
      const current = revisionsByLane?.get(laneId) ?? { competitionState: 0, score: 0 };
      const data = dataByLane?.get(laneId);
      if (current.competitionState <= initial.competitionState) {
        errors.set(laneId, `Lane ${laneId} did not publish its final competition state`);
        continue;
      }
      if (data?.competitionState?.phase !== 'FINISHED') {
        errors.set(laneId, `Lane ${laneId} did not publish a FINISHED competition state`);
        continue;
      }
      if (data.competitionState.finalSnapshotCommandId !== finalSnapshotCommandId) {
        errors.set(laneId, `Lane ${laneId} did not publish state for the current finish command`);
        continue;
      }
      if (current.score <= initial.score || !data.score) {
        errors.set(laneId, `Lane ${laneId} did not publish its final score`);
        continue;
      }
      if (data.score.finalSnapshotCommandId !== finalSnapshotCommandId) {
        errors.set(laneId, `Lane ${laneId} did not publish a score for the current finish command`);
        continue;
      }
      if (data.score.sessionId !== data.competitionState.sessionId) {
        errors.set(laneId, `Lane ${laneId} published final state and score for different sessions`);
        continue;
      }
      if (competition && data.score.acc !== competition.acc) {
        errors.set(
          laneId,
          `Lane ${laneId} published ${data.score.acc} scoring mode for a ${competition.acc} competition`,
        );
      }
    }

    return errors;
  }

  waitForFreshFinalLaneSnapshots(
    competitionId: string,
    laneIds: string[],
    baseline: Map<string, CompetitionLaneSnapshotRevision>,
    finalSnapshotCommandId: string,
  ): Promise<Map<string, string>> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (errors: Map<string, string>): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.competitionLaneSnapshotListeners.delete(check);
        resolve(errors);
      };
      const check = (): void => {
        const errors = this.getFinalLaneSnapshotErrors(competitionId, laneIds, baseline, finalSnapshotCommandId);
        if (errors.size === 0) finish(errors);
      };

      this.competitionLaneSnapshotListeners.add(check);
      timer = setTimeout(
        () => finish(this.getFinalLaneSnapshotErrors(competitionId, laneIds, baseline, finalSnapshotCommandId)),
        this.commandTimeoutMs,
      );
      check();
    });
  }

  /**
   * State publications are independent of command acknowledgements. Waiting on
   * the snapshot stream removes a transport race between a series transition
   * and the subsequent absolute-time target command.
   */
  waitForTimedTargetLaneReadiness(
    competitionId: string,
    laneIds: readonly string[],
    stageIndex: number,
    seriesIndex: number,
  ): Promise<string[]> {
    const findNotReady = (): string[] =>
      laneIds.filter((laneId) => {
        const lane = this.lanes.get(laneId)?.competitionState;
        return (
          lane?.competitionId !== competitionId ||
          lane.phase !== 'MATCH' ||
          lane.currentStage.index !== stageIndex ||
          lane.currentSeries.index !== seriesIndex ||
          lane.awaitingSeriesStart === true
        );
      });

    const initial = findNotReady();
    if (initial.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (remaining: string[]): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.competitionLaneSnapshotListeners.delete(check);
        resolve(remaining);
      };
      const check = (): void => {
        const remaining = findNotReady();
        if (remaining.length === 0) finish(remaining);
      };

      this.competitionLaneSnapshotListeners.add(check);
      timer = setTimeout(() => finish(findNotReady()), this.commandTimeoutMs);
      check();
    });
  }

  private notifyCompetitionLaneSnapshotListeners(): void {
    for (const listener of [...this.competitionLaneSnapshotListeners]) listener();
  }

  projectCompetitionLaneData(): void {
    for (const [laneId, lane] of this.lanes) {
      const competitionId = this.getCompetitionIdForLane(laneId);
      const data = competitionId ? this.competitionLaneData.get(competitionId)?.get(laneId) : undefined;
      this.lanes.set(laneId, {
        ...lane,
        competitionState: data?.competitionState ?? null,
        assignment: data?.assignment ?? null,
        score: data?.score ?? null,
        lastCompetitionShot: data?.lastCompetitionShot ?? null,
        timedTargetState: data?.timedTargetState ?? null,
        qualificationRecoveryState: data?.qualificationRecoveryState ?? null,
        lastQualificationRecoveryShot: data?.lastQualificationRecoveryShot ?? null,
      });
    }

    for (const state of this.competitions.values()) {
      const dataByLane = this.competitionLaneData.get(state.competitionId);
      for (const laneId of state.laneIds) {
        if (this.lanes.has(laneId) || this.getCompetitionIdForLane(laneId) !== state.competitionId) continue;
        const data = dataByLane?.get(laneId);
        this.lanes.set(laneId, { ...this.getOrCreateLane(laneId), ...(data ?? {}) });
      }
    }
  }

  getCompetitionIdForLane(laneId: string): string | null {
    return (
      [...this.competitions.values()]
        .filter((competition) => competition.laneIds.includes(laneId))
        .sort(
          (a, b) =>
            Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.competitionId.localeCompare(b.competitionId),
        )[0]?.competitionId ?? null
    );
  }

  rememberCompetitionShot(shot: CompetitionShotPayload): void {
    let shotsByLane = this.competitionShots.get(shot.competitionId);
    if (!shotsByLane) {
      shotsByLane = new Map();
      this.competitionShots.set(shot.competitionId, shotsByLane);
    }
    const shots = shotsByLane.get(shot.laneId) ?? [];
    shots.push(shot);
    shotsByLane.set(shot.laneId, shots);
  }

  clearCompetitionShotHistory(competitionId: string, laneId: string): void {
    this.competitionShots.get(competitionId)?.delete(laneId);
    this.updateCompetitionLane(competitionId, laneId, { lastCompetitionShot: null });
  }

  getCompetitionResultLanes(competitionId: string, laneIds: string[]): CompetitionResultLane[] {
    if (!this.competitions.has(competitionId)) throw new Error(`MQTT competition not found: ${competitionId}`);
    const dataByLane = this.competitionLaneData.get(competitionId);
    const shotsByLane = this.competitionShots.get(competitionId);
    return laneIds
      .filter((laneId) => !this.competitions.get(competitionId)?.transferredSourceLaneIds?.includes(laneId))
      .map((laneId) => ({
        laneId,
        assignment: dataByLane?.get(laneId)?.assignment ?? null,
        score: dataByLane?.get(laneId)?.score ?? null,
        shots: [...(shotsByLane?.get(laneId) ?? [])]
          .filter((shot) => shot.scored && shot.isRecorded)
          .sort(
            (a, b) =>
              a.stageIndex - b.stageIndex ||
              a.seriesIndex - b.seriesIndex ||
              a.shotNumberInSeries - b.shotNumberInSeries ||
              Date.parse(a.publishedAt) - Date.parse(b.publishedAt),
          ),
      }));
  }

  rememberShot(shotId: string): boolean {
    if (this.seenShotIds.has(shotId)) return false;
    this.seenShotIds.add(shotId);
    this.seenShotQueue.push(shotId);
    if (this.seenShotQueue.length > 10_000) {
      const oldest = this.seenShotQueue.shift();
      if (oldest) this.seenShotIds.delete(oldest);
    }
    return true;
  }
}
