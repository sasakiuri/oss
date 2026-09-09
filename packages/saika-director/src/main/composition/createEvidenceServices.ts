// SPDX-License-Identifier: MIT
import { allMigrations } from '@/main/infrastructure/database/migrations';
import {
  ElectronEvidenceFileTransfer,
  EvidenceFileArchiveSource,
  EvidenceFileService,
  NodeEvidenceFileStore,
  SqliteEvidenceFileRepository,
  TargetEvidenceFileSubjectSource,
} from '@/main/modules/evidence-files';
import {
  CompetitionEvidenceBundleBuilder,
  ElectronArchiveFileGateway,
  OperationalArchiveService,
  SqliteCompetitionEvidenceSource,
  SqliteDatabaseBackupGateway,
} from '@/main/modules/operational-archives';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { join } from 'path';

type EvidenceServicesDependencies = { userDataPath: string; appVersion: string; dbPath: string } & Pick<
  ServiceRegistry,
  'database' | 'targetExaminationRepository'
>;

/** Composes evidence services from explicit dependencies. */
export function createEvidenceServices({
  userDataPath,
  database,
  targetExaminationRepository,
  appVersion,
  dbPath,
}: EvidenceServicesDependencies) {
  const evidenceFileStore = new NodeEvidenceFileStore(join(userDataPath, 'evidence-files'));
  const evidenceFileRepository = new SqliteEvidenceFileRepository(database);
  const evidenceFileService = new EvidenceFileService(
    evidenceFileRepository,
    evidenceFileStore,
    new ElectronEvidenceFileTransfer(),
    new TargetEvidenceFileSubjectSource(targetExaminationRepository),
  );
  const archiveFileGateway = new ElectronArchiveFileGateway();
  const operationalArchiveService = new OperationalArchiveService(
    new SqliteCompetitionEvidenceSource(database),
    new CompetitionEvidenceBundleBuilder(appVersion),
    archiveFileGateway,
    new SqliteDatabaseBackupGateway(database, dbPath, userDataPath, allMigrations.at(-1)?.version ?? 0),
    undefined,
    new EvidenceFileArchiveSource(evidenceFileRepository, evidenceFileStore),
  );

  return { evidenceFileService, archiveFileGateway, operationalArchiveService };
}

export type EvidenceServices = ReturnType<typeof createEvidenceServices>;
