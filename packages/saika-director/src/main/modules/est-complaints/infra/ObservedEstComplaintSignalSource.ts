import type { MqttControlSnapshotDto } from '@/shared/ipc/contracts';

import type { EstComplaintSignalSnapshot, IEstComplaintSignalSource } from '../domain/IEstComplaintSignalSource';

/** In-process inbox populated through the MQTT control-state event boundary. */
export class ObservedEstComplaintSignalSource implements IEstComplaintSignalSource {
  private readonly snapshots = new Map<string, EstComplaintSignalSnapshot>();

  observe(snapshot: MqttControlSnapshotDto): void {
    for (const lane of snapshot.lanes) {
      const signal = lane.estComplaintSignal;
      if (!signal?.signalId || !signal.issue || !signal.context || !signal.signalledAt) continue;
      const observed: EstComplaintSignalSnapshot = {
        signalId: signal.signalId,
        laneId: signal.laneId,
        firingPointNumber: lane.firingPointNumber,
        status: signal.status,
        issue: signal.issue,
        context: structuredClone(signal.context),
        message: signal.message,
        signalledAt: new Date(signal.signalledAt),
      };
      const existing = this.snapshots.get(signal.signalId);
      if (existing && immutableFingerprint(existing) !== immutableFingerprint(observed)) {
        throw new Error(`Lane EST complaint ${signal.signalId} changed its immutable context`);
      }
      this.snapshots.set(signal.signalId, freezeSnapshot(observed));
    }
  }

  findById(signalId: string): EstComplaintSignalSnapshot | null {
    const value = this.snapshots.get(signalId);
    return value ? freezeSnapshot(value) : null;
  }

  listByCompetition(competitionId: string): EstComplaintSignalSnapshot[] {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.context.competitionId === competitionId)
      .map(freezeSnapshot);
  }
}

function immutableFingerprint(value: EstComplaintSignalSnapshot): string {
  return JSON.stringify({
    signalId: value.signalId,
    laneId: value.laneId,
    firingPointNumber: value.firingPointNumber,
    issue: value.issue,
    context: value.context,
    message: value.message,
    signalledAt: value.signalledAt.toISOString(),
  });
}

function freezeSnapshot(value: EstComplaintSignalSnapshot): EstComplaintSignalSnapshot {
  const context = structuredClone(value.context);
  if (context.lastShot) Object.freeze(context.lastShot);
  Object.freeze(context);
  return Object.freeze({ ...value, context, signalledAt: new Date(value.signalledAt.getTime()) });
}
