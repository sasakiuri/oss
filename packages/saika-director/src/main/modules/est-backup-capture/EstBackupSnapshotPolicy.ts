export type EstBackupSnapshotMode = 'STABLE_READS' | 'COMPLETE_FILES';

/** Admission is independent of reading files, parsing records and retaining evidence. */
export interface IEstBackupSnapshotPolicy {
  accepts(mode: EstBackupSnapshotMode, digest: string, previousDigest: string | null): boolean;
}

export class EstBackupSnapshotPolicy implements IEstBackupSnapshotPolicy {
  accepts(mode: EstBackupSnapshotMode, digest: string, previousDigest: string | null): boolean {
    if (mode === 'COMPLETE_FILES') return true;
    if (mode === 'STABLE_READS') return digest === previousDigest;
    throw new Error('Unknown backup snapshot mode');
  }
}
