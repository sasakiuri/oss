export interface ArchiveFileGateway {
  chooseEvidenceDestination(suggestedFileName: string): Promise<string | null>;
  chooseResultsBookDestination(suggestedFileName: string): Promise<string | null>;
  chooseBackupDestination(suggestedFileName: string): Promise<string | null>;
  chooseRestoreSource(): Promise<string | null>;
  writeUtf8Atomic(destination: string, content: string): Promise<void>;
}

export interface DatabaseBackupInspection {
  readonly path: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly schemaVersion: number;
  readonly championshipCount: number;
  readonly integrityOk: boolean;
  readonly inspectedAt: string;
}

export interface PendingDatabaseRestore {
  readonly sourceFileName: string;
  readonly stagedSha256: string;
  readonly schemaVersion: number;
  readonly stagedAt: string;
  readonly recoveryCopyWillBeCreated: true;
}

export interface DatabaseBackupGateway {
  create(destination: string): Promise<DatabaseBackupInspection>;
  inspect(source: string): Promise<DatabaseBackupInspection>;
  stageRestore(source: string, expectedSha256: string): Promise<PendingDatabaseRestore>;
  getPendingRestore(): Promise<PendingDatabaseRestore | null>;
  cancelPendingRestore(): Promise<boolean>;
  compatibilityIssues(inspection: DatabaseBackupInspection): readonly string[];
}
