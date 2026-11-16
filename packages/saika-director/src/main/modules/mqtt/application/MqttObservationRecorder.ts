// SPDX-License-Identifier: MIT
import type { FinalOperationService } from '@/main/modules/final-operations';
import type { ILaneControlRepository } from '@/main/modules/lane-control';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { CompetitionTypeRegistry, FiringWindowDetectionPolicy } from '@/shared/competitionTypes';
import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';
import { Logger } from '@/shared/logging';

import type { ICompetitionShotJournal } from '../domain/ICompetitionShotJournal';
import type { IFiringWindowJournal } from '../domain/IFiringWindowJournal';
import type { IShotObservationEvidenceJournal } from '../domain/IShotObservationEvidenceJournal';
import type { DirectorMqttCallbacks, MqttControlSnapshot } from './DirectorMqttTypes';
import { FiringPointNumberResolver } from './FiringPointNumberResolver';
import { FiringWindowDetectionService } from './FiringWindowDetectionService';
import { toCompetitionShotObservation } from './toCompetitionShotObservation';

// Operators read these lines under the module's historical log context.
const logger = Logger.create('mqtt.module');

export interface MqttObservationRecorderDependencies {
  readonly eventBus: Pick<IEventBus, 'emit'>;
  readonly debugLogStore: { addEntry(entry: { timestamp: number; direction: 'LOG'; raw: string }): void };
  readonly competitionTypeRegistry: Pick<CompetitionTypeRegistry, 'get'>;
  readonly laneControlRepository: Pick<ILaneControlRepository, 'findByChannel'>;
  readonly competitionShotJournal: ICompetitionShotJournal;
  readonly firingWindowJournal: IFiringWindowJournal;
  readonly shotObservationEvidenceJournal: Pick<IShotObservationEvidenceJournal, 'append'>;
  readonly finalOperationService: Pick<FinalOperationService, 'observeShootOffShot'>;
  /** The coordinator's current snapshot; read only when a competition shot arrives. */
  readonly readSnapshot: () => MqttControlSnapshot;
}

type ObservationCallbacks = Required<
  Pick<
    DirectorMqttCallbacks,
    | 'onStateChanged'
    | 'onCompetitionShotObserved'
    | 'onCompetitionShootOffShotObserved'
    | 'onQualificationRecoveryStateObserved'
    | 'onQualificationRecoveryShotObserved'
    | 'onShotObservationEvidenceObserved'
    | 'onFiringBoundary'
    | 'onCompetitionShot'
    | 'onDebugLog'
    | 'onSessionReset'
    | 'onError'
  >
>;

/**
 * Records what the MQTT coordinator observes: journals shots, evidence and firing boundaries, assigns
 * Director firing-point numbers and emits the domain events the rest of the Director listens to.
 * It owns the per-session lookup state, which a session reset clears.
 */
export class MqttObservationRecorder {
  private readonly firingPointNumberResolver = new FiringPointNumberResolver();
  private readonly announcedChannelByLaneId = new Map<string, number>();
  private readonly competitionTypeIdByCompetitionId = new Map<string, string>();
  private readonly firingWindowDetectionService: FiringWindowDetectionService;

  constructor(private readonly deps: MqttObservationRecorderDependencies) {
    this.firingWindowDetectionService = new FiringWindowDetectionService(
      deps.competitionShotJournal,
      deps.firingWindowJournal,
      {
        onViolationDetected: (violation) => {
          deps.eventBus.emit({
            type: 'FiringWindowViolationDetected',
            timestamp: violation.detectedAt.getTime(),
            violation,
          });
        },
      },
    );
  }

  /** The coordinator callbacks this recorder handles. */
  readonly callbacks: ObservationCallbacks = {
    onStateChanged: (snapshot) => this.handleSnapshot(snapshot),
    onCompetitionShotObserved: (shot, payloadJson) => {
      try {
        const observation = toCompetitionShotObservation(shot, payloadJson, new Date());
        this.deps.competitionShotJournal.append(observation);
        this.firingWindowDetectionService.observe(observation, this.getFiringWindowPolicy(observation.competitionId));
      } catch (error) {
        logger.error(`Failed to journal MQTT shot ${shot.shotId}:`, error);
      }
    },
    onCompetitionShootOffShotObserved: (shot) => {
      try {
        this.deps.finalOperationService.observeShootOffShot({
          runId: shot.runId,
          competitionId: shot.competitionId,
          iteration: shot.iteration,
          laneId: shot.laneId,
          shotId: shot.shotId,
          scoreX10: shot.effectiveScoreX10,
          x: shot.x,
          y: shot.y,
          firedAt: shot.firedAt,
        });
      } catch (error) {
        logger.error(`Failed to record Final shoot-off shot ${shot.shotId}:`, error);
      }
    },
    onQualificationRecoveryStateObserved: (state, payloadJson) => {
      const observedAt = new Date();
      this.deps.eventBus.emit({
        type: 'QualificationRecoveryStateObserved',
        timestamp: observedAt.getTime(),
        state,
        payloadJson,
        observedAt,
      });
    },
    onQualificationRecoveryShotObserved: (shot, payloadJson) => {
      const observedAt = new Date();
      this.deps.eventBus.emit({
        type: 'QualificationRecoveryShotObserved',
        timestamp: observedAt.getTime(),
        shot,
        payloadJson,
        observedAt,
      });
    },
    onShotObservationEvidenceObserved: (evidence, payloadJson) => {
      try {
        const observedAt = new Date();
        this.deps.shotObservationEvidenceJournal.append({ evidence, payloadJson, observedAt });
        this.deps.eventBus.emit({
          type: 'ShotObservationEvidenceObserved',
          timestamp: observedAt.getTime(),
          evidence,
          observedAt,
        });
      } catch (error) {
        logger.error(`Failed to journal shot observation evidence ${evidence.evidenceId}:`, error);
      }
    },
    onFiringBoundary: (boundary) => {
      try {
        this.firingWindowDetectionService.recordBoundary(boundary, this.getFiringWindowPolicy(boundary.competitionId));
      } catch (error) {
        logger.error(`Failed to journal ${boundary.sourceAction} firing boundary:`, error);
      }
    },
    onCompetitionShot: (shot) => {
      const lane = this.deps.readSnapshot().lanes.find((entry) => entry.laneId === shot.laneId);
      if (!lane?.hardware) return;
      const channel = this.firingPointNumberResolver.resolve(shot.laneId, lane.laneAlias);
      if (channel === null) return;
      const localLane = this.deps.laneControlRepository.findByChannel(channel);
      const shotNumber = (localLane?.lastReceivedShotNumber ?? 0) + 1;
      this.deps.eventBus.emit({
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: shot.competitionId,
        channel,
        shotNumber,
        score: (shot.effectiveScoreX10 ?? shot.rawScoreX10) / 10,
        seriesNumber: shot.seriesIndex + 1,
      });
    },
    onDebugLog: (message) => {
      const entry = {
        timestamp: Date.now(),
        direction: 'LOG' as const,
        raw: message,
      };
      this.deps.debugLogStore.addEntry(entry);
      this.deps.eventBus.emit({
        type: 'DebugLogEmitted',
        ...entry,
      });
    },
    onSessionReset: () => {
      this.firingPointNumberResolver.reset();
      this.announcedChannelByLaneId.clear();
      this.competitionTypeIdByCompetitionId.clear();
    },
    onError: (message) => {
      this.deps.eventBus.emit({
        type: 'MqttConnectionError',
        timestamp: Date.now(),
        message,
      });
    },
  };

  /** Adds Director firing-point numbers to a coordinator snapshot. */
  toControlSnapshotDto(snapshot: MqttControlSnapshot): MqttControlSnapshotDto {
    // An offline retained Lane must not reserve a firing-point number forever.
    // A replacement Lane with the same alias can then claim the intended
    // number while the offline entry remains visible for diagnostics.
    for (const lane of snapshot.lanes) {
      if (lane.hardware?.connection.status === 'offline') this.firingPointNumberResolver.forget(lane.laneId);
    }

    // Settle mappings first: resolving an explicit alias can displace a
    // fallback mapping that appeared earlier in the snapshot.
    for (const lane of snapshot.lanes) {
      if (lane.hardware !== null && lane.hardware.connection.status !== 'offline') {
        this.firingPointNumberResolver.resolve(lane.laneId, lane.laneAlias);
      }
    }

    return {
      ...snapshot,
      lanes: snapshot.lanes.map((lane) => ({
        ...lane,
        firingPointNumber:
          lane.hardware === null || lane.hardware.connection.status === 'offline'
            ? null
            : this.firingPointNumberResolver.resolve(lane.laneId, lane.laneAlias),
      })),
    };
  }

  private handleSnapshot(snapshot: MqttControlSnapshot): void {
    const controlSnapshot = this.toControlSnapshotDto(snapshot);
    for (const competition of controlSnapshot.competitions) {
      const previousTypeId = this.competitionTypeIdByCompetitionId.get(competition.competitionId);
      this.competitionTypeIdByCompetitionId.set(competition.competitionId, competition.competitionTypeId);
      if (previousTypeId !== competition.competitionTypeId) {
        try {
          this.firingWindowDetectionService.reconcileCompetition(
            competition.competitionId,
            this.getFiringWindowPolicy(competition.competitionId),
          );
        } catch (error) {
          logger.error(`Failed to reconcile firing-window evidence for ${competition.competitionId}:`, error);
        }
      }
    }
    for (const lane of controlSnapshot.lanes) {
      if (lane.hardware?.connection.status !== 'connected') continue;
      const channel = lane.firingPointNumber;
      if (channel === null || this.announcedChannelByLaneId.get(lane.laneId) === channel) continue;
      this.announcedChannelByLaneId.set(lane.laneId, channel);
      this.deps.eventBus.emit({
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: lane.laneId,
        channel,
      });
    }

    this.deps.eventBus.emit({
      type: 'MqttControlStateChanged',
      timestamp: Date.now(),
      snapshot: controlSnapshot,
    });
  }

  private getFiringWindowPolicy(competitionId: string): FiringWindowDetectionPolicy | undefined {
    const competitionTypeId = this.competitionTypeIdByCompetitionId.get(competitionId);
    if (!competitionTypeId) return undefined;
    try {
      return this.deps.competitionTypeRegistry.get(competitionTypeId).firingWindowDetection;
    } catch (error) {
      logger.error(`Failed to resolve firing-window policy for ${competitionId}:`, error);
      return undefined;
    }
  }
}
