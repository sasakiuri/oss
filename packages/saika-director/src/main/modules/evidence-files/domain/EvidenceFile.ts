export interface EvidenceFile {
  readonly id: string;
  readonly caseId: string;
  readonly evidenceId: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly importedBy: string;
  readonly importedAt: string;
  readonly statement: string;
}

export interface IEvidenceFileRepository {
  find(id: string): EvidenceFile | null;
  list(evidenceId: string): readonly EvidenceFile[];
  append(file: EvidenceFile): void;
}

export interface IEvidenceFileStore {
  put(bytes: Uint8Array): Promise<{ sha256: string; sizeBytes: number }>;
  readVerified(sha256: string, sizeBytes: number): Promise<Uint8Array>;
}

export interface IEvidenceFileTransfer {
  chooseSource(): Promise<{ fileName: string; bytes: Uint8Array } | null>;
  saveCopy(fileName: string, bytes: Uint8Array): Promise<boolean>;
}

/** Links files to an existing case without importing its workflow into file storage. */
export interface IEvidenceFileSubjectSource {
  assertAttachable(caseId: string, evidenceId: string): { expectedSha256: string | null };
}
