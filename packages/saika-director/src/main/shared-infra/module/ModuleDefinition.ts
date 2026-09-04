/**
 * ModuleDefinition.ts
 *
 * ServiceRegistry + Generic ModuleDefinition + ModuleOutput
 *
 * Each module declares its dependencies via a `deps` array (subset of
 * ServiceRegistry keys). The ModuleLoader injects only the declared
 * subset, enforcing the principle of least privilege at the type level.
 */

import type Database from 'better-sqlite3';
import type { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { IDebugLogStore } from '@/main/infrastructure/logging/Logger';
import type { ILaneControlRepository } from '@/main/modules/lane-control';
import type { LaneTimerService } from '@/main/modules/lane-control';
import type { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import type {
  IFinalResultRepository,
  IFinalResultsReader,
  IQualificationResultsReader,
  IResultRepository,
} from '@/main/modules/results';
import type {
  IScoringDecisionAdmissionPolicy,
  IScoringDecisionRepository,
  IScoringDecisionTargetResolver,
} from '@/main/modules/scoring-decisions';
import type {
  ICompetitionShotJournal,
  IFiringWindowJournal,
  IShotObservationEvidenceJournal,
} from '@/main/modules/mqtt';
import type { IResultVerificationRepository, ResultVerificationService } from '@/main/modules/result-verification';
import type { IRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import type { IFinalPlacementReviewRepository } from '@/main/modules/final-placement-review';
import type { ITargetExaminationRepository } from '@/main/modules/target-examinations';
import type { IRangeInterruptionRepository } from '@/main/modules/range-interruptions';
import type { ICompetitionDataGuard } from '@/main/shared-infra/operations/CompetitionDataGuard';
import type {
  FinalResultDeclarationService,
  IResultPublicationPolicyResolver,
  IResultPublicationReadiness,
  IResultPublicationRepository,
} from '@/main/modules/result-publication';
import type { IMixedTeamFinalResultRepository } from '@/main/modules/team-results';
import type { TeamResultsService } from '@/main/modules/team-results';
import type {
  EstBackupRecordImportService,
  EstBackupVerificationService,
} from '@/main/modules/est-backup-verification';
import type { RulePackRegistry } from '@sasakiuri/saika-rules';
import type { FinalOperationService } from '@/main/modules/final-operations';
import type { IIrregularShotCaseRepository } from '@/main/modules/irregular-shot-cases';
import type { OperationalArchiveService } from '@/main/modules/operational-archives';
import type { ResultsBookService } from '@/main/modules/results-books';
import type { AthleteSanctionService, ISanctionAuthorizationResolver } from '@/main/modules/athlete-sanctions';
import type { IParticipantEligibilityReader } from '@/main/shared-infra/operations/ParticipantEligibility';

// Re-export for convenience
export type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';

// ---------------------------------------------------------------------------
// ServiceRegistry — single flat record of all injectable services
// ---------------------------------------------------------------------------

export interface ServiceRegistry {
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
  readonly estBackupVerificationService: EstBackupVerificationService;
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
