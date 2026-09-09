// SPDX-License-Identifier: MIT
import {
  BackupCaptureReadinessService,
  SqliteBackupCaptureReadinessSettingsRepository,
} from '@/main/modules/backup-capture-readiness';
import {
  EstBackupResultCheckService,
  SqliteEstBackupVerificationRepository,
} from '@/main/modules/est-backup-verification';
import {
  EstInspectionStartService,
  SqliteEstChampionshipInspectionRepository,
  SqliteEstInspectionStartSettingsRepository,
} from '@/main/modules/est-championship-inspections';
import {
  FinalRecoveryPublicationBlocker,
  SqliteFinalRecoveryEventScope,
  SqliteFinalRecoveryRepository,
} from '@/main/modules/final-recoveries';
import { IncidentReportPublicationBlocker } from '@/main/modules/incident-reports';
import { IrregularShotPublicationBlocker } from '@/main/modules/irregular-shot-cases';
import { ObservationReviewPublicationBlocker } from '@/main/modules/observation-reviews';
import {
  EquipmentControlPublicationBlocker,
  SqlitePostCompetitionEquipmentCheckRepository,
  StoredEquipmentControlPublicationSource,
} from '@/main/modules/post-competition-equipment-control';
import { ProtestPublicationBlocker, SqliteProtestEventScope, SqliteProtestRepository } from '@/main/modules/protests';
import { PolicyBoundVerificationSource } from '@/main/modules/publication-review-policies';
import {
  QualificationMalfunctionPublicationBlocker,
  SqliteQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import {
  RelayReadinessService,
  SqliteRelayReadinessRepository,
  SqliteRelayStartSettingsRepository,
} from '@/main/modules/relay-readiness';
import {
  FinalResultDeclarationService,
  GuardedResultPublicationReadiness,
  OptionalResultPublicationBlocker,
  RulePackResultPublicationPolicyResolver,
  VerifiedResultPublicationReadiness,
} from '@/main/modules/result-publication';
import {
  QualificationResultVerificationSource,
  ResultVerificationService,
  ResultVerificationSourceRegistry,
} from '@/main/modules/result-verification';
import {
  ElectronResultsBookDocumentExporter,
  QualificationTeamRecordCandidateSource,
  ResultsBookService,
  ResultWorkflowOfficialRevisionSource,
  SqliteResultsBookRepository,
  SqliteResultsBookSource,
  VerifiedResultsBookResultSnapshotSource,
} from '@/main/modules/results-books';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { CompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type { BackupServices } from './createBackupServices';
import type { CompetitionServices } from './createCompetitionServices';
import type { EvidenceServices } from './createEvidenceServices';
import type { OperatorServices } from './createOperatorServices';
import type { ScoringServices } from './createScoringServices';

type PublicationServicesDependencies = Pick<
  ServiceRegistry,
  | 'resultVerificationRepository'
  | 'queryBus'
  | 'qualificationResultsReader'
  | 'competitionTypeRegistry'
  | 'estBackupVerificationService'
  | 'database'
  | 'estBackupCaptureService'
  | 'observationReviewService'
  | 'irregularShotCaseRepository'
  | 'rangeIncidentReportRepository'
  | 'scoringDecisionRepository'
  | 'resultPublicationRepository'
  | 'teamResultsService'
  | 'rulePackRegistry'
> &
  Pick<BackupServices, 'finalVerificationSource'> &
  Pick<OperatorServices, 'publicationReviewPolicies' | 'officialSigningPolicy' | 'policyEvents'> &
  Pick<ScoringServices, 'reviewCompetitionScope'> &
  Pick<
    CompetitionServices,
    'athleteSanctionRepository' | 'athleteEntryReferenceSource' | 'finalResultDeclarationRepository'
  > &
  Pick<EvidenceServices, 'archiveFileGateway'>;

/** Composes publication services from explicit dependencies. */
export function createPublicationServices({
  resultVerificationRepository,
  queryBus,
  qualificationResultsReader,
  competitionTypeRegistry,
  estBackupVerificationService,
  finalVerificationSource,
  publicationReviewPolicies,
  officialSigningPolicy,
  database,
  estBackupCaptureService,
  policyEvents,
  observationReviewService,
  reviewCompetitionScope,
  athleteSanctionRepository,
  athleteEntryReferenceSource,
  irregularShotCaseRepository,
  rangeIncidentReportRepository,
  scoringDecisionRepository,
  resultPublicationRepository,
  finalResultDeclarationRepository,
  teamResultsService,
  archiveFileGateway,
  rulePackRegistry,
}: PublicationServicesDependencies) {
  const resultVerificationService = new ResultVerificationService(
    resultVerificationRepository,
    new ResultVerificationSourceRegistry(
      [
        new QualificationResultVerificationSource(
          queryBus,
          qualificationResultsReader,
          competitionTypeRegistry,
          estBackupVerificationService,
        ),
        finalVerificationSource,
      ].map(
        (source) =>
          new PolicyBoundVerificationSource(source, (eventId, scope) =>
            publicationReviewPolicies.approvalRevision(eventId, scope),
          ),
      ),
    ),
    officialSigningPolicy,
  );
  const estBackupResultCheckService = new EstBackupResultCheckService(
    new SqliteEstBackupVerificationRepository(database),
    resultVerificationService,
  );
  const relayReadinessService = new RelayReadinessService(
    new SqliteRelayReadinessRepository(database),
    undefined,
    new SqliteRelayStartSettingsRepository(database),
  );
  const estInspectionStartService = new EstInspectionStartService(
    new SqliteEstInspectionStartSettingsRepository(database),
    new SqliteEstChampionshipInspectionRepository(database),
  );
  const backupCaptureReadiness = new BackupCaptureReadinessService(
    new SqliteBackupCaptureReadinessSettingsRepository(database),
    (eventId) => estBackupCaptureService.status(eventId),
    (eventId) => policyEvents.findById(eventId) !== null,
  );
  const competitionStartReadiness = new CompetitionStartReadiness([
    relayReadinessService,
    estInspectionStartService,
    backupCaptureReadiness,
  ]);
  const verifiedResultPublicationReadiness = new VerifiedResultPublicationReadiness(resultVerificationService);
  const resultPublicationReadiness = new GuardedResultPublicationReadiness(verifiedResultPublicationReadiness, [
    new OptionalResultPublicationBlocker(
      new ObservationReviewPublicationBlocker(observationReviewService, (eventId, scope) =>
        reviewCompetitionScope.competitionIds(eventId, scope),
      ),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireObservationReviews,
    ),
    new OptionalResultPublicationBlocker(
      new EquipmentControlPublicationBlocker(
        new StoredEquipmentControlPublicationSource(
          new SqlitePostCompetitionEquipmentCheckRepository(database),
          athleteSanctionRepository,
          athleteEntryReferenceSource,
        ),
      ),
      (eventId, scope) =>
        publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireEquipmentChecksComplete,
    ),
    new OptionalResultPublicationBlocker(
      new ProtestPublicationBlocker(new SqliteProtestRepository(database), (eventId, resultScope) =>
        new SqliteProtestEventScope(database).competitionIds(eventId, resultScope),
      ),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireProtestCasesComplete,
    ),
    new IrregularShotPublicationBlocker(
      irregularShotCaseRepository,
      rangeIncidentReportRepository,
      scoringDecisionRepository,
    ),
    new QualificationMalfunctionPublicationBlocker(new SqliteQualificationMalfunctionRepository(database)),
    new OptionalResultPublicationBlocker(
      new IncidentReportPublicationBlocker(rangeIncidentReportRepository, scoringDecisionRepository),
      (eventId, scope) => publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireIncidentReports,
    ),
    new OptionalResultPublicationBlocker(
      new FinalRecoveryPublicationBlocker(new SqliteFinalRecoveryRepository(database), (eventId) =>
        new SqliteFinalRecoveryEventScope(database).competitionIds(eventId),
      ),
      (eventId, scope) =>
        publicationReviewPolicies.get(eventId, scope).effectiveSettings.requireFinalRecoveriesComplete,
    ),
  ]);
  const resultsBookResultSnapshots = new VerifiedResultsBookResultSnapshotSource(
    resultVerificationService,
    new ResultWorkflowOfficialRevisionSource(resultPublicationRepository, finalResultDeclarationRepository),
    resultPublicationReadiness,
  );
  const resultsBookService = new ResultsBookService(
    new SqliteResultsBookRepository(database),
    new SqliteResultsBookSource(database, resultsBookResultSnapshots, [
      new QualificationTeamRecordCandidateSource(database, teamResultsService, resultsBookResultSnapshots),
    ]),
    archiveFileGateway,
    undefined,
    new ElectronResultsBookDocumentExporter(),
    officialSigningPolicy,
  );
  const finalResultDeclarationService = new FinalResultDeclarationService(
    finalResultDeclarationRepository,
    resultPublicationReadiness,
  );
  const resultPublicationPolicyResolver = new RulePackResultPublicationPolicyResolver(
    queryBus,
    competitionTypeRegistry,
    rulePackRegistry,
    // Local/JRSF definitions can keep their existing operation until they get a Rule Pack.
    { scoreProtestWindowMs: 10 * 60 * 1000 },
  );

  return {
    resultVerificationService,
    estBackupResultCheckService,
    relayReadinessService,
    estInspectionStartService,
    backupCaptureReadiness,
    competitionStartReadiness,
    resultPublicationReadiness,
    resultsBookService,
    finalResultDeclarationService,
    resultPublicationPolicyResolver,
  };
}

export type PublicationServices = ReturnType<typeof createPublicationServices>;
