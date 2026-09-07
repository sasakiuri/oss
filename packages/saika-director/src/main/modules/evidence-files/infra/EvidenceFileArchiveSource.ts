import type { ICompetitionEvidenceAttachmentSource } from '@/main/modules/operational-archives';
import type { CompetitionEvidenceSection, EvidenceRecord } from '@/main/modules/operational-archives';
import type { IEvidenceFileRepository, IEvidenceFileStore } from '../domain/EvidenceFile';

/** Independent original files, included only for evidence already present in the archive snapshot. */
export class EvidenceFileArchiveSource implements ICompetitionEvidenceAttachmentSource {
  constructor(
    private readonly repository: IEvidenceFileRepository,
    private readonly store: IEvidenceFileStore,
    private readonly maximumTotalBytes = 128 * 1024 * 1024,
  ) {}

  async collect(sections: readonly CompetitionEvidenceSection[]): Promise<CompetitionEvidenceSection[]> {
    const evidence = sections.find((section) => section.id === 'target-examination-evidence')?.records ?? [];
    const files = evidence.flatMap((item) => (typeof item.id === 'string' ? this.repository.list(item.id) : []));
    if (files.reduce((sum, file) => sum + file.sizeBytes, 0) > this.maximumTotalBytes) {
      throw new Error('Evidence attachments exceed the configured bundle size limit; export verified files separately');
    }
    const records: EvidenceRecord[] = [];
    for (const file of files) {
      const bytes = await this.store.readVerified(file.sha256, file.sizeBytes);
      records.push({ ...file, encoding: 'base64', contentBase64: Buffer.from(bytes).toString('base64') });
    }
    return [{ id: 'evidence-file-attachments', records }];
  }
}
