import { basename } from 'node:path';

import type {
  DatabaseBackupReceiptDto,
  EvidenceBundleReceiptDto,
  PendingRestoreDto,
  RestoreCandidateDto,
} from '@/shared/ipc/contracts';

import {
  CompetitionEvidenceBundleBuilder,
  serializeEvidenceBundle,
  type ICompetitionEvidenceSource,
} from '../domain/CompetitionEvidenceBundle';
import type { ArchiveFileGateway, DatabaseBackupGateway } from './OperationalArchivePorts';

interface RestoreCandidateSession {
  readonly path: string;
  readonly sha256: string;
}

export class OperationalArchiveService {
  private readonly restoreCandidates = new Map<string, RestoreCandidateSession>();

  constructor(
    private readonly evidenceSource: ICompetitionEvidenceSource,
    private readonly bundleBuilder: CompetitionEvidenceBundleBuilder,
    private readonly files: ArchiveFileGateway,
    private readonly backups: DatabaseBackupGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exportCompetitionEvidence(championshipId: string): Promise<EvidenceBundleReceiptDto> {
    const bundle = this.bundleBuilder.build(this.evidenceSource, championshipId);
    const destination = await this.files.chooseEvidenceDestination(
      `${safeFileStem(bundle.championship.name)}-evidence-${dateStamp(this.now())}.json`,
    );
    if (!destination) return { status: 'CANCELLED' };
    const content = serializeEvidenceBundle(bundle);
    await this.files.writeUtf8Atomic(destination, content);
    return {
      status: 'COMPLETED',
      path: destination,
      fileName: basename(destination),
      sizeBytes: Buffer.byteLength(content),
      bundleSha256: bundle.bundleSha256,
      sections: bundle.sections.map((section) => ({
        id: section.id,
        recordCount: section.recordCount,
        sha256: section.sha256,
      })),
      generatedAt: bundle.generatedAt,
    };
  }

  async createDatabaseBackup(): Promise<DatabaseBackupReceiptDto> {
    const destination = await this.files.chooseBackupDestination(`saika-director-backup-${dateStamp(this.now())}.db`);
    if (!destination) return { status: 'CANCELLED' };
    return { status: 'COMPLETED', inspection: await this.backups.create(destination) };
  }

  async inspectRestoreCandidate(): Promise<RestoreCandidateDto> {
    const source = await this.files.chooseRestoreSource();
    if (!source) return { status: 'CANCELLED' };
    const inspection = await this.backups.inspect(source);
    const compatibilityIssues = [...this.backups.compatibilityIssues(inspection)];
    const candidateToken = crypto.randomUUID();
    this.restoreCandidates.set(candidateToken, { path: inspection.path, sha256: inspection.sha256 });
    return {
      status: 'READY',
      candidateToken,
      inspection,
      compatible: compatibilityIssues.length === 0,
      compatibilityIssues,
    };
  }

  async scheduleRestore(candidateToken: string): Promise<PendingRestoreDto> {
    const candidate = this.restoreCandidates.get(candidateToken);
    if (!candidate) throw new Error('The restore candidate token is unknown or expired; inspect the backup again');
    this.restoreCandidates.delete(candidateToken);
    return this.backups.stageRestore(candidate.path, candidate.sha256);
  }

  getPendingRestore(): Promise<PendingRestoreDto | null> {
    return this.backups.getPendingRestore();
  }

  async cancelPendingRestore(): Promise<{ cancelled: boolean }> {
    return { cancelled: await this.backups.cancelPendingRestore() };
  }
}

function safeFileStem(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || 'championship';
}

function dateStamp(value: Date): string {
  return value.toISOString().replaceAll(/[:.]/g, '-');
}
