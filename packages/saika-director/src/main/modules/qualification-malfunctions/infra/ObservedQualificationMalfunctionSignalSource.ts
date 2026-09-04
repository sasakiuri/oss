import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import type {
  IQualificationMalfunctionSignalSource,
  QualificationMalfunctionSignalSnapshot,
} from '../domain/IQualificationMalfunctionSignalSource';

/** In-process inbox populated through the MQTT control-state event boundary. */
export class ObservedQualificationMalfunctionSignalSource implements IQualificationMalfunctionSignalSource {
  private readonly snapshots = new Map<string, QualificationMalfunctionSignalSnapshot>();

  observe(snapshot: MqttControlSnapshotDto): void {
    for (const lane of snapshot.lanes) {
      const signal = lane.qualificationMalfunctionSignal;
      if (!signal?.signalId || !signal.context || !signal.signalledAt) continue;
      const observed: QualificationMalfunctionSignalSnapshot = {
        signalId: signal.signalId,
        laneId: signal.laneId,
        status: signal.status,
        competitionId: signal.context.competitionId,
        sessionId: signal.context.sessionId,
        participantId: signal.context.participantId,
        participantName: signal.context.participantName,
        startNumber: signal.context.startNumber,
        phase: signal.context.phase,
        stageIndex: signal.context.stageIndex,
        seriesIndex: signal.context.seriesIndex,
        seriesShotLimit: signal.context.seriesShotLimit,
        recordedShots: signal.context.recordedShots,
        timedTargetProgramId: signal.context.timedTargetProgramId,
        exposureIndex: signal.context.exposureIndex,
        message: signal.message,
        signalledAt: new Date(signal.signalledAt),
      };
      const existing = this.snapshots.get(signal.signalId);
      if (existing && immutableFingerprint(existing) !== immutableFingerprint(observed)) {
        throw new Error(`Lane declaration ${signal.signalId} changed its immutable context`);
      }
      this.snapshots.set(signal.signalId, freezeSnapshot(observed));
    }
  }

  findById(signalId: string): QualificationMalfunctionSignalSnapshot | null {
    const value = this.snapshots.get(signalId);
    return value ? freezeSnapshot(value) : null;
  }
}

function immutableFingerprint(value: QualificationMalfunctionSignalSnapshot): string {
  return JSON.stringify({
    signalId: value.signalId,
    laneId: value.laneId,
    competitionId: value.competitionId,
    sessionId: value.sessionId,
    participantId: value.participantId,
    participantName: value.participantName,
    startNumber: value.startNumber,
    phase: value.phase,
    stageIndex: value.stageIndex,
    seriesIndex: value.seriesIndex,
    seriesShotLimit: value.seriesShotLimit,
    recordedShots: value.recordedShots,
    timedTargetProgramId: value.timedTargetProgramId,
    exposureIndex: value.exposureIndex,
    message: value.message,
    signalledAt: value.signalledAt.toISOString(),
  });
}

function freezeSnapshot(value: QualificationMalfunctionSignalSnapshot): QualificationMalfunctionSignalSnapshot {
  return Object.freeze({ ...value, signalledAt: new Date(value.signalledAt.getTime()) });
}
