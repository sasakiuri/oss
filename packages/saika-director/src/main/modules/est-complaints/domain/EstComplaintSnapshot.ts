import type { EstComplaintSignalSnapshot } from './IEstComplaintSignalSource';
import { sha256Json } from '@/main/domain/sha256Json';

export interface SerializedEstComplaintSignalSnapshot {
  readonly signalId: string;
  readonly laneId: string;
  readonly firingPointNumber: number | null;
  readonly status: 'ACTIVE' | 'CLEARED';
  readonly issue: EstComplaintSignalSnapshot['issue'];
  readonly context: EstComplaintSignalSnapshot['context'];
  readonly message: string | null;
  readonly signalledAt: string;
}

export function serializeEstComplaintSnapshot(
  snapshot: EstComplaintSignalSnapshot,
): SerializedEstComplaintSignalSnapshot {
  return {
    signalId: snapshot.signalId,
    laneId: snapshot.laneId,
    firingPointNumber: snapshot.firingPointNumber,
    status: snapshot.status,
    issue: snapshot.issue,
    context: structuredClone(snapshot.context),
    message: snapshot.message,
    signalledAt: snapshot.signalledAt.toISOString(),
  };
}

export function estComplaintSnapshotHash(snapshot: EstComplaintSignalSnapshot): string {
  return sha256Json(serializeEstComplaintSnapshot(snapshot));
}
