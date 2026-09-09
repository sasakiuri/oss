import type { EstBackupRecordParser } from '@/main/modules/est-backup-verification';

import type { IEstBackupFeed } from './EstBackupCaptureService';
import type { EstBackupSnapshotMode } from './EstBackupSnapshotPolicy';

/** Only the adapter interprets its versioned reference; the runner stores it opaquely. */
export interface EstBackupAdapterReference {
  readonly adapter: string;
  readonly options: Record<string, unknown>;
}
export interface EstBackupCapturePlan {
  readonly eventId: string;
  readonly sourceLabel: string;
  readonly feed: EstBackupAdapterReference;
  readonly parser: EstBackupAdapterReference | null;
  readonly intervalMilliseconds: number;
  readonly snapshotMode: EstBackupSnapshotMode;
  readonly resumeOnStartup: boolean;
  readonly enabled: boolean;
}
export interface IEstBackupCapturePlanRepository {
  find(eventId: string): EstBackupCapturePlan | null;
  list(): readonly EstBackupCapturePlan[];
  save(plan: EstBackupCapturePlan): void;
  remove(eventId: string): void;
}
export interface IEstBackupCapturePersistence {
  readonly plans: IEstBackupCapturePlanRepository;
  restoreFeed(reference: EstBackupAdapterReference): Promise<IEstBackupFeed>;
  describeParser(parser: EstBackupRecordParser): EstBackupAdapterReference;
  restoreParser(reference: EstBackupAdapterReference): EstBackupRecordParser;
}
