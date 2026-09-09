// SPDX-License-Identifier: MIT
import {
  AthleteSanctionParticipantEligibilityReader,
  AthleteSanctionResultClassificationSource,
  AthleteSanctionService,
  SqliteAthleteEntryReferenceSource,
  SqliteAthleteSanctionRepository,
} from '@/main/modules/athlete-sanctions';
import { SqliteParticipantRepository } from '@/main/modules/championship';
import { SqliteFinalPlacementReviewRepository } from '@/main/modules/final-placement-review';
import { SqliteRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import { SqliteIrregularShotCaseRepository } from '@/main/modules/irregular-shot-cases';
import { SqliteLaneControlRepository } from '@/main/modules/lane-control';
import {
  SqliteCompetitionShotJournal,
  SqliteFiringWindowJournal,
  SqliteShotObservationEvidenceJournal,
} from '@/main/modules/mqtt';
import {
  InterruptionCompetitionDataGuard,
  SqliteRangeInterruptionRepository,
} from '@/main/modules/range-interruptions';
import { ReserveTransferDataGuard, SqliteReserveTransferRepository } from '@/main/modules/reserve-lane-transfers';
import {
  SqliteFinalResultDeclarationRepository,
  SqliteResultPublicationRepository,
} from '@/main/modules/result-publication';
import { SqliteResultVerificationRepository } from '@/main/modules/result-verification';
import { SqliteFinalResultRepository, SqliteResultRepository } from '@/main/modules/results';
import { SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import {
  EvidenceHoldCompetitionDataGuard,
  SqliteTargetExaminationRepository,
} from '@/main/modules/target-examinations';
import { SqliteMixedTeamFinalResultRepository } from '@/main/modules/team-results';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import { CompositeCompetitionDataGuard } from '@/main/shared-infra/operations/CompositeCompetitionDataGuard';

type CompetitionServicesDependencies = Pick<ServiceRegistry, 'database'>;

/** Composes competition services from explicit dependencies. */
export function createCompetitionServices({ database }: CompetitionServicesDependencies) {
  const laneControlRepository = new SqliteLaneControlRepository(database);
  const resultRepository = new SqliteResultRepository(database);
  const finalResultRepository = new SqliteFinalResultRepository(database);
  const mixedTeamFinalResultRepository = new SqliteMixedTeamFinalResultRepository(database);
  const participantRepository = new SqliteParticipantRepository(database);
  const scoringDecisionRepository = new SqliteScoringDecisionRepository(database);
  const competitionShotJournal = new SqliteCompetitionShotJournal(database);
  const firingWindowJournal = new SqliteFiringWindowJournal(database);
  const shotObservationEvidenceJournal = new SqliteShotObservationEvidenceJournal(database);
  const resultVerificationRepository = new SqliteResultVerificationRepository(database);
  const rangeIncidentReportRepository = new SqliteRangeIncidentReportRepository(database);
  const targetExaminationRepository = new SqliteTargetExaminationRepository(database);
  const rangeInterruptionRepository = new SqliteRangeInterruptionRepository(database);
  const competitionDataGuard = new CompositeCompetitionDataGuard([
    new ReserveTransferDataGuard(new SqliteReserveTransferRepository(database)),
    new EvidenceHoldCompetitionDataGuard(targetExaminationRepository),
    new InterruptionCompetitionDataGuard(rangeInterruptionRepository),
  ]);
  const finalPlacementReviewRepository = new SqliteFinalPlacementReviewRepository(database);
  const resultPublicationRepository = new SqliteResultPublicationRepository(database);
  const finalResultDeclarationRepository = new SqliteFinalResultDeclarationRepository(database);
  const irregularShotCaseRepository = new SqliteIrregularShotCaseRepository(database);
  const athleteSanctionRepository = new SqliteAthleteSanctionRepository(database);
  const athleteEntryReferenceSource = new SqliteAthleteEntryReferenceSource(database);
  const athleteSanctionService = new AthleteSanctionService(athleteSanctionRepository, athleteEntryReferenceSource);
  const sanctionResultClassificationSource = new AthleteSanctionResultClassificationSource(
    athleteSanctionRepository,
    athleteEntryReferenceSource,
  );
  const participantEligibilityReader = new AthleteSanctionParticipantEligibilityReader(
    athleteSanctionRepository,
    athleteEntryReferenceSource,
  );

  return {
    laneControlRepository,
    resultRepository,
    finalResultRepository,
    mixedTeamFinalResultRepository,
    participantRepository,
    scoringDecisionRepository,
    competitionShotJournal,
    firingWindowJournal,
    shotObservationEvidenceJournal,
    resultVerificationRepository,
    rangeIncidentReportRepository,
    targetExaminationRepository,
    rangeInterruptionRepository,
    competitionDataGuard,
    finalPlacementReviewRepository,
    resultPublicationRepository,
    finalResultDeclarationRepository,
    irregularShotCaseRepository,
    athleteSanctionRepository,
    athleteEntryReferenceSource,
    athleteSanctionService,
    sanctionResultClassificationSource,
    participantEligibilityReader,
  };
}

export type CompetitionServices = ReturnType<typeof createCompetitionServices>;
