// SPDX-License-Identifier: MIT
import { SqliteEventRepository } from '@/main/modules/championship';
import { SqliteFinalRecoveryRepository } from '@/main/modules/final-recoveries';
import { SqliteFinalFiringRepository } from '@/main/modules/final-recovery-firing';
import {
  MalfunctionQualificationScoreOverlaySource,
  MalfunctionScoreApplicationService,
  ResultMalfunctionScoreTargetSource,
  SqliteMalfunctionScoreApplicationRepository,
} from '@/main/modules/malfunction-score-applications';
import {
  AppliedReviewCorrections,
  ObservationReviewService,
  SqliteObservationReviewRepository,
  StoredReviewSubjects,
} from '@/main/modules/observation-reviews';
import { SqliteProtestEventScope } from '@/main/modules/protests';
import {
  SqliteMalfunctionScoreSheetRepository,
  SqliteQualificationMalfunctionRepository,
} from '@/main/modules/qualification-malfunctions';
import { FinalResultsReader, QualificationResultsReader, ScoringDecisionTargetResolver } from '@/main/modules/results';
import {
  CompositeScoreCorrectionCaseSource,
  ExaminationScoreCorrectionCaseSource,
  FinalFiringScoreCorrectionCaseSource,
  ScoreCorrectionService,
  SqliteScoreCorrectionRepository,
  StoredScoreCorrectionTargetSource,
} from '@/main/modules/score-corrections';
import { CompetitionTypeTeamTieBreakPolicyResolver, TeamResultsService } from '@/main/modules/team-results';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';

import type { CompetitionServices } from './createCompetitionServices';

type ScoringServicesDependencies = Pick<
  ServiceRegistry,
  | 'database'
  | 'resultRepository'
  | 'competitionTypeRegistry'
  | 'finalResultRepository'
  | 'targetExaminationRepository'
  | 'shotObservationEvidenceJournal'
  | 'firingWindowJournal'
  | 'queryBus'
  | 'scoringDecisionRepository'
  | 'finalPlacementReviewRepository'
> &
  Pick<CompetitionServices, 'sanctionResultClassificationSource' | 'participantRepository'>;

/** Composes scoring services from explicit dependencies. */
export function createScoringServices({
  database,
  resultRepository,
  competitionTypeRegistry,
  finalResultRepository,
  targetExaminationRepository,
  shotObservationEvidenceJournal,
  firingWindowJournal,
  queryBus,
  scoringDecisionRepository,
  sanctionResultClassificationSource,
  finalPlacementReviewRepository,
  participantRepository,
}: ScoringServicesDependencies) {
  const malfunctionScoreApplicationRepository = new SqliteMalfunctionScoreApplicationRepository(database);
  const malfunctionScoreCases = new SqliteQualificationMalfunctionRepository(database);
  const malfunctionScoreApplicationService = new MalfunctionScoreApplicationService(
    malfunctionScoreCases,
    new SqliteMalfunctionScoreSheetRepository(database),
    malfunctionScoreApplicationRepository,
    new ResultMalfunctionScoreTargetSource(
      resultRepository,
      new SqliteEventRepository(database, competitionTypeRegistry),
      competitionTypeRegistry,
    ),
  );
  const qualificationOverlays = new MalfunctionQualificationScoreOverlaySource(
    malfunctionScoreApplicationRepository,
    malfunctionScoreCases,
  );
  const scoreCorrectionService = new ScoreCorrectionService(
    new SqliteScoreCorrectionRepository(database),
    new StoredScoreCorrectionTargetSource(
      resultRepository,
      finalResultRepository,
      new SqliteEventRepository(database, competitionTypeRegistry),
      competitionTypeRegistry,
      qualificationOverlays,
    ),
    new CompositeScoreCorrectionCaseSource([
      new ExaminationScoreCorrectionCaseSource(targetExaminationRepository),
      new FinalFiringScoreCorrectionCaseSource(
        new SqliteFinalRecoveryRepository(database),
        new SqliteFinalFiringRepository(database),
      ),
    ]),
  );
  const reviewCompetitionScope = new SqliteProtestEventScope(database);
  const observationReviewService = new ObservationReviewService(
    new StoredReviewSubjects(shotObservationEvidenceJournal, firingWindowJournal),
    new SqliteObservationReviewRepository(database),
    new AppliedReviewCorrections(
      new SqliteScoreCorrectionRepository(database),
      scoreCorrectionService,
      (eventId, scope) => reviewCompetitionScope.competitionIds(eventId, scope),
    ),
    undefined,
    (eventId, scope) => reviewCompetitionScope.competitionIds(eventId, scope),
  );
  const qualificationResultsReader = new QualificationResultsReader(
    queryBus,
    resultRepository,
    scoringDecisionRepository,
    competitionTypeRegistry,
    participantRepository,
    sanctionResultClassificationSource,
    qualificationOverlays,
    scoreCorrectionService,
  );
  const finalResultsReader = new FinalResultsReader(
    queryBus,
    finalResultRepository,
    scoringDecisionRepository,
    finalPlacementReviewRepository,
    competitionTypeRegistry,
    sanctionResultClassificationSource,
    scoreCorrectionService,
  );
  const scoringDecisionTargetResolver = new ScoringDecisionTargetResolver(
    queryBus,
    resultRepository,
    finalResultRepository,
    competitionTypeRegistry,
  );
  const teamResultsService = new TeamResultsService(
    participantRepository,
    resultRepository,
    qualificationResultsReader,
    new CompetitionTypeTeamTieBreakPolicyResolver(queryBus, competitionTypeRegistry),
  );

  return {
    malfunctionScoreApplicationService,
    scoreCorrectionService,
    reviewCompetitionScope,
    observationReviewService,
    qualificationResultsReader,
    finalResultsReader,
    scoringDecisionTargetResolver,
    teamResultsService,
  };
}

export type ScoringServices = ReturnType<typeof createScoringServices>;
