import type {
  EvidenceFile,
  IEvidenceFileRepository,
  IEvidenceFileStore,
  IEvidenceFileSubjectSource,
  IEvidenceFileTransfer,
} from '../domain/EvidenceFile';

export interface ImportEvidenceFileInput {
  readonly id: string;
  readonly caseId: string;
  readonly evidenceId: string;
  readonly importedBy: string;
  readonly statement: string;
}

export class EvidenceFileService {
  constructor(
    private readonly repository: IEvidenceFileRepository,
    private readonly store: IEvidenceFileStore,
    private readonly transfer: IEvidenceFileTransfer,
    private readonly subjects: IEvidenceFileSubjectSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list(evidenceId: string): readonly EvidenceFile[] {
    return this.repository.list(evidenceId);
  }

  async importFile(input: ImportEvidenceFileInput): Promise<EvidenceFile | null> {
    const request = { ...input, importedBy: input.importedBy.trim(), statement: input.statement.trim() };
    if (!request.id || !request.importedBy || !request.statement)
      throw new Error('Importer and custody statement are required');
    const previous = this.repository.find(request.id);
    if (previous) {
      if (
        previous.caseId !== request.caseId ||
        previous.evidenceId !== request.evidenceId ||
        previous.importedBy !== request.importedBy ||
        previous.statement !== request.statement
      ) {
        throw new Error('This file import ID is bound to different evidence');
      }
      return previous;
    }
    this.subjects.assertAttachable(request.caseId, request.evidenceId);
    const selected = await this.transfer.chooseSource();
    if (!selected) return null;
    const stored = await this.store.put(selected.bytes);
    // Dialogs and storage are asynchronous: recheck the immutable subject and its current workflow.
    const subject = this.subjects.assertAttachable(request.caseId, request.evidenceId);
    if (subject.expectedSha256 && subject.expectedSha256 !== stored.sha256) {
      throw new Error('The selected file does not match the recorded evidence SHA-256');
    }
    const file: EvidenceFile = Object.freeze({
      ...request,
      ...stored,
      fileName: selected.fileName,
      importedAt: this.now().toISOString(),
    });
    this.repository.append(file);
    return file;
  }

  async exportFile(id: string): Promise<{ saved: boolean }> {
    const file = this.repository.find(id);
    if (!file) throw new Error('Evidence file not found');
    const bytes = await this.store.readVerified(file.sha256, file.sizeBytes);
    return { saved: await this.transfer.saveCopy(file.fileName, bytes) };
  }
}
