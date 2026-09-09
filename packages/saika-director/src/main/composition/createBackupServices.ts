// SPDX-License-Identifier: MIT
import {
  ElectronEstBackupFeedSelector,
  EstBackupCaptureService,
  EstBackupParserReferences,
  SqliteEstBackupCapturePlanRepository,
} from '@/main/modules/est-backup-capture';
import { EstBackupSourceService, SqliteEstBackupSourceRepository } from '@/main/modules/est-backup-sources';
import {
  CanonicalCsvEstBackupRecordParser,
  CanonicalJsonEstBackupRecordParser,
  ElectronEstBackupRecordFileGateway,
  EstBackupRecordImportService,
  EstBackupRecordParserRegistry,
  EstBackupVerificationService,
  FinalEstBackupSubjectSource,
  SqliteEstBackupVerificationRepository,
} from '@/main/modules/est-backup-verification';
import { FinalResultVerificationSource } from '@/main/modules/result-verification';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import type { CompetitionServices } from './createCompetitionServices';
import type { OperatorServices } from './createOperatorServices';

type BackupServicesDependencies = Pick<
  ServiceRegistry,
  | 'database'
  | 'queryBus'
  | 'finalResultsReader'
  | 'mixedTeamFinalResultRepository'
  | 'competitionTypeRegistry'
  | 'qualificationResultsReader'
  | 'teamResultsService'
> &
  Pick<OperatorServices, 'policyEvents'> &
  Pick<CompetitionServices, 'participantRepository'>;

/** Composes backup services from explicit dependencies. */
export function createBackupServices({
  database,
  policyEvents,
  queryBus,
  finalResultsReader,
  mixedTeamFinalResultRepository,
  competitionTypeRegistry,
  participantRepository,
  qualificationResultsReader,
  teamResultsService,
}: BackupServicesDependencies) {
  const estBackupRecordParsers = new EstBackupRecordParserRegistry([
    new CanonicalJsonEstBackupRecordParser(),
    new CanonicalCsvEstBackupRecordParser(),
  ]);
  const estBackupSourceService = new EstBackupSourceService(
    new SqliteEstBackupSourceRepository(database),
    (id) => policyEvents.findById(id) !== null,
  );
  const estBackupRecordImportService = new EstBackupRecordImportService(
    new ElectronEstBackupRecordFileGateway(estBackupRecordParsers.supportedExtensions),
    estBackupRecordParsers,
    estBackupSourceService,
  );
  const estBackupFeedSelector = new ElectronEstBackupFeedSelector();
  const estBackupParserReferences = new EstBackupParserReferences();
  const estBackupCapturePlans = new SqliteEstBackupCapturePlanRepository(database);
  const estBackupCaptureService = new EstBackupCaptureService(
    estBackupFeedSelector,
    estBackupRecordImportService,
    (id) => policyEvents.findById(id) !== null,
    estBackupRecordParsers.supportedExtensions,
    undefined,
    undefined,
    {
      plans: estBackupCapturePlans,
      restoreFeed: (reference) => estBackupFeedSelector.restore(reference),
      describeParser: (parser) => estBackupParserReferences.describe(parser),
      restoreParser: (reference) => estBackupParserReferences.restore(reference),
    },
  );
  const finalVerificationSource = new FinalResultVerificationSource(
    queryBus,
    finalResultsReader,
    mixedTeamFinalResultRepository,
    competitionTypeRegistry,
  );
  const estBackupVerificationService = new EstBackupVerificationService(
    new SqliteEstBackupVerificationRepository(database),
    participantRepository,
    qualificationResultsReader,
    teamResultsService,
    new FinalEstBackupSubjectSource(finalVerificationSource, participantRepository),
    estBackupSourceService,
  );

  return {
    estBackupSourceService,
    estBackupRecordImportService,
    estBackupCapturePlans,
    estBackupCaptureService,
    finalVerificationSource,
    estBackupVerificationService,
  };
}

export type BackupServices = ReturnType<typeof createBackupServices>;
