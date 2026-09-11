import { vistaModule } from '@/main/modules/vista';
// SPDX-License-Identifier: MIT
import { adjudicationCasesModule } from '@/main/modules/adjudication-cases';
import { athleteSanctionsModule } from '@/main/modules/athlete-sanctions';
import { boardModule } from '@/main/modules/board';
import { championshipModule } from '@/main/modules/championship';
import { competitionAnnouncementsModule } from '@/main/modules/competition-announcements';
import { eliminationPlanningModule } from '@/main/modules/elimination-planning';
import { equipmentRegistryModule } from '@/main/modules/equipment-registry';
import { estBackupVerificationModule } from '@/main/modules/est-backup-verification';
import { estChampionshipInspectionsModule } from '@/main/modules/est-championship-inspections';
import { estComplaintsModule } from '@/main/modules/est-complaints';
import { evidenceFilesModule } from '@/main/modules/evidence-files';
import { finalControlModule } from '@/main/modules/final-control';
import { finalOperationsModule } from '@/main/modules/final-operations';
import { finalPlacementReviewModule } from '@/main/modules/final-placement-review';
import { finalRecoveriesModule } from '@/main/modules/final-recoveries';
import { finalRecoveryFiringModule } from '@/main/modules/final-recovery-firing';
import { incidentReportsModule } from '@/main/modules/incident-reports';
import { irregularShotCasesModule } from '@/main/modules/irregular-shot-cases';
import { laneControlModule } from '@/main/modules/lane-control';
import { malfunctionScoreApplicationsModule } from '@/main/modules/malfunction-score-applications';
import { mixedTeamFinalControlModule } from '@/main/modules/mixed-team-final-control';
import { mixedTeamTimeoutsModule } from '@/main/modules/mixed-team-timeouts';
import { mqttModule } from '@/main/modules/mqtt';
import { observationReviewsModule } from '@/main/modules/observation-reviews';
import { operationalArchivesModule } from '@/main/modules/operational-archives';
import { operationalTemplatesModule } from '@/main/modules/operational-templates';
import { postCompetitionEquipmentControlModule } from '@/main/modules/post-competition-equipment-control';
import { productionOperationsModule } from '@/main/modules/production-operations';
import { protestsModule } from '@/main/modules/protests';
import { qualificationMalfunctionsModule } from '@/main/modules/qualification-malfunctions';
import { rangeInterruptionsModule } from '@/main/modules/range-interruptions';
import { relayAthleteLifecycleModule } from '@/main/modules/relay-athlete-lifecycle';
import { relayReadinessModule } from '@/main/modules/relay-readiness';
import { reserveLaneTransfersModule } from '@/main/modules/reserve-lane-transfers';
import { resultPublicationModule } from '@/main/modules/result-publication';
import { resultVerificationModule } from '@/main/modules/result-verification';
import { resultsModule } from '@/main/modules/results';
import { resultsBooksModule } from '@/main/modules/results-books';
import { scoreCorrectionsModule } from '@/main/modules/score-corrections';
import { scoringDecisionsModule } from '@/main/modules/scoring-decisions';
import { shootoffModule } from '@/main/modules/shootoff';
import { squaddingModule } from '@/main/modules/squadding';
import { startListsModule } from '@/main/modules/start-lists';
import { targetExaminationsModule } from '@/main/modules/target-examinations';
import { teamResultsModule } from '@/main/modules/team-results';
import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';

// Static module list (Vite/Electron safe — no dynamic import)
export const directorModules = [
  observationReviewsModule,
  malfunctionScoreApplicationsModule,
  scoreCorrectionsModule,
  evidenceFilesModule,
  championshipModule,
  athleteSanctionsModule,
  laneControlModule,
  scoringDecisionsModule,
  resultsModule,
  shootoffModule,
  boardModule,
  competitionAnnouncementsModule,
  targetExaminationsModule,
  estComplaintsModule,
  rangeInterruptionsModule,
  relayReadinessModule,
  relayAthleteLifecycleModule,
  estChampionshipInspectionsModule,
  postCompetitionEquipmentControlModule,
  equipmentRegistryModule,
  operationalTemplatesModule,
  eliminationPlanningModule,
  teamResultsModule,
  protestsModule,
  estBackupVerificationModule,
  finalControlModule,
  adjudicationCasesModule,
  irregularShotCasesModule,
  operationalArchivesModule,
  resultsBooksModule,
  finalOperationsModule,
  finalRecoveriesModule,
  qualificationMalfunctionsModule,
  startListsModule,
  mixedTeamFinalControlModule,
  squaddingModule,
  productionOperationsModule,
  mixedTeamTimeoutsModule,
  mqttModule,
  reserveLaneTransfersModule,
  finalRecoveryFiringModule,
  resultVerificationModule,
  resultPublicationModule,
  incidentReportsModule,
  finalPlacementReviewModule,
  vistaModule,
] satisfies readonly ModuleDefinition[];
