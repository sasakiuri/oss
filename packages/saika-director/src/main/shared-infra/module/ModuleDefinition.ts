/**
 * ModuleDefinition.ts
 *
 * ServiceRegistry + Generic ModuleDefinition + ModuleOutput
 *
 * Each module declares its dependencies via a `deps` array (subset of
 * ServiceRegistry keys). The ModuleLoader injects only the declared
 * subset, enforcing the principle of least privilege at the type level.
 */

import type { RulePackRegistry } from '@sasakiuri/saika-rules';
import type Database from 'better-sqlite3';

import type { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import type { IDebugLogStore } from '@/main/infrastructure/logging/Logger';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { AthleteSanctionService, ISanctionAuthorizationResolver } from '@/main/modules/athlete-sanctions';
import type { EstBackupCaptureService } from '@/main/modules/est-backup-capture/EstBackupCaptureService';
import type { EstBackupSourceService } from '@/main/modules/est-backup-sources';
import type {
  EstBackupRecordImportService,
  EstBackupResultCheckService,
  EstBackupVerificationService,
} from '@/main/modules/est-backup-verification';
import type { EstInspectionStartService } from '@/main/modules/est-championship-inspections';
import type { EvidenceFileService } from '@/main/modules/evidence-files';
import type { FinalOperationService } from '@/main/modules/final-operations';
import type { IFinalPlacementReviewRepository } from '@/main/modules/final-placement-review';
import type { IRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import type { IIrregularShotCaseRepository } from '@/main/modules/irregular-shot-cases';
import type { ILaneControlRepository, LaneTimerService } from '@/main/modules/lane-control';
import type { MalfunctionScoreApplicationService } from '@/main/modules/malfunction-score-applications';
import type {
  ICompetitionShotJournal,
  IFiringWindowJournal,
  IShotObservationEvidenceJournal,
} from '@/main/modules/mqtt';
import type { ObservationReviewService } from '@/main/modules/observation-reviews';
import type { OperationalArchiveService } from '@/main/modules/operational-archives';
import type { OperationalSettingTarget } from '@/main/modules/operational-profiles';
import type { IRangeInterruptionRepository } from '@/main/modules/range-interruptions';
import type { RelayReadinessService } from '@/main/modules/relay-readiness';
import type {
  FinalResultDeclarationService,
  IResultPublicationPolicyResolver,
  IResultPublicationReadiness,
  IResultPublicationRepository,
} from '@/main/modules/result-publication';
import type { IResultVerificationRepository, ResultVerificationService } from '@/main/modules/result-verification';
import type {
  IFinalResultRepository,
  IFinalResultsReader,
  IQualificationResultsReader,
  IResultRepository,
} from '@/main/modules/results';
import type { ResultsBookService } from '@/main/modules/results-books';
import type { ScoreCorrectionService } from '@/main/modules/score-corrections';
import type {
  IScoringDecisionAdmissionPolicy,
  IScoringDecisionRepository,
  IScoringDecisionTargetResolver,
} from '@/main/modules/scoring-decisions';
import type { ITargetExaminationRepository } from '@/main/modules/target-examinations';
import type { IMixedTeamFinalResultRepository, TeamResultsService } from '@/main/modules/team-results';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { ICompetitionDataGuard } from '@/main/shared-infra/operations/CompetitionDataGuard';
import type { ICompetitionStartReadiness } from '@/main/shared-infra/operations/CompetitionStartReadiness';
import type { IParticipantEligibilityReader } from '@/main/shared-infra/operations/ParticipantEligibility';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';

// Re-export for convenience
export type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';

// ---------------------------------------------------------------------------
// ServiceRegistry — single flat record of all injectable services
// ---------------------------------------------------------------------------

export interface ServiceRegistry {
  readonly estInspectionStartService: EstInspectionStartService;
  readonly competitionStartReadiness: ICompetitionStartReadiness;
  readonly relayReadinessService: RelayReadinessService;
  readonly scoreCorrectionService: ScoreCorrectionService;
  readonly observationReviewService: ObservationReviewService;
  readonly evidenceFileService: EvidenceFileService;
  readonly malfunctionScoreApplicationService: MalfunctionScoreApplicationService;
  readonly database: Database.Database;
  readonly eventBus: TypedEventBus;
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
  readonly ipcRouter: IpcRouter;
  readonly windowManager: WindowManager;
  readonly debugLogStore: IDebugLogStore;
  readonly laneControlRepository: ILaneControlRepository;
  readonly laneTimerService: LaneTimerService;
  readonly appConfigService: AppConfigService;
  readonly competitionTypeRegistry: CompetitionTypeRegistry;
  readonly rulePackRegistry: RulePackRegistry;
  readonly finalOperationService: FinalOperationService;
  readonly resultRepository: IResultRepository;
  readonly finalResultRepository: IFinalResultRepository;
  readonly mixedTeamFinalResultRepository: IMixedTeamFinalResultRepository;
  readonly teamResultsService: TeamResultsService;
  readonly estBackupRecordImportService: EstBackupRecordImportService;
  readonly estBackupSourceService: EstBackupSourceService;
  readonly estBackupResultCheckService: EstBackupResultCheckService;
  readonly estBackupVerificationService: EstBackupVerificationService;
  readonly estBackupCaptureService: EstBackupCaptureService;
  readonly scoringDecisionAdmissionPolicy: IScoringDecisionAdmissionPolicy;
  readonly scoringDecisionRepository: IScoringDecisionRepository;
  readonly scoringDecisionTargetResolver: IScoringDecisionTargetResolver;
  readonly competitionShotJournal: ICompetitionShotJournal;
  readonly firingWindowJournal: IFiringWindowJournal;
  readonly shotObservationEvidenceJournal: IShotObservationEvidenceJournal;
  readonly qualificationResultsReader: IQualificationResultsReader;
  readonly finalResultsReader: IFinalResultsReader;
  readonly resultVerificationRepository: IResultVerificationRepository;
  readonly resultVerificationService: ResultVerificationService;
  readonly rangeIncidentReportRepository: IRangeIncidentReportRepository;
  readonly targetExaminationRepository: ITargetExaminationRepository;
  readonly rangeInterruptionRepository: IRangeInterruptionRepository;
  readonly competitionDataGuard: ICompetitionDataGuard;
  readonly finalPlacementReviewRepository: IFinalPlacementReviewRepository;
  readonly resultPublicationRepository: IResultPublicationRepository;
  readonly resultPublicationReadiness: IResultPublicationReadiness;
  readonly resultPublicationPolicyResolver: IResultPublicationPolicyResolver;
  readonly finalResultDeclarationService: FinalResultDeclarationService;
  readonly irregularShotCaseRepository: IIrregularShotCaseRepository;
  readonly operationalArchiveService: OperationalArchiveService;
  readonly operationalSettingTargets: readonly OperationalSettingTarget[];
  readonly resultsBookService: ResultsBookService;
  readonly athleteSanctionService: AthleteSanctionService;
  readonly participantEligibilityReader: IParticipantEligibilityReader;
  readonly sanctionAuthorizationResolver: ISanctionAuthorizationResolver;
}

// ---------------------------------------------------------------------------
// ModuleOutput — what a module can return from register()
// ---------------------------------------------------------------------------

export interface LifecycleEntry {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ModuleOutput {
  lifecycle?: LifecycleEntry[];
  eventForwarding?: (EventForwardingRule | TransformerForwardingRule)[];
}

// ---------------------------------------------------------------------------
// ModuleDefinition — generic, deps-driven
// ---------------------------------------------------------------------------

export interface ModuleDefinition<TDeps extends keyof ServiceRegistry = keyof ServiceRegistry> {
  readonly name: string;
  readonly deps: readonly TDeps[];
  register(ctx: Pick<ServiceRegistry, TDeps>): ModuleOutput | void;
}
