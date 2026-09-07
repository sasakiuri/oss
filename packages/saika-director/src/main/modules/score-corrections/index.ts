// SPDX-License-Identifier: MIT
export { ScoreCorrectionService } from './application/ScoreCorrectionService';
export { SqliteScoreCorrectionRepository } from './infra/SqliteScoreCorrectionRepository';
export {
  StoredScoreCorrectionTargetSource,
  ExaminationScoreCorrectionCaseSource,
} from './infra/StoredScoreCorrectionSources';
export { scoreCorrectionsModule } from './scoreCorrections.module';

export { CompositeScoreCorrectionCaseSource } from './infra/CompositeScoreCorrectionCaseSource';
export { FinalFiringScoreCorrectionCaseSource } from './infra/FinalFiringScoreCorrectionCaseSource';
