export { resultVerificationModule } from './resultVerification.module';
export { SqliteResultVerificationRepository } from './infra/SqliteResultVerificationRepository';
export { ResultVerificationService } from './application/ResultVerificationService';
export {
  ResultVerificationSourceRegistry,
  type IResultVerificationSource,
  type IResultVerificationSourceResolver,
  type ResultVerificationSourceSnapshot,
  type VerifiableResult,
} from './application/ResultVerificationSource';
export {
  UnsupportedTeamResultVerificationReadiness,
  type ITeamResultVerificationReadiness,
  type TeamResultVerificationKind,
  type TeamResultVerificationReadiness,
  type TeamResultVerificationReadinessRequest,
} from './application/ITeamResultVerificationReadiness';
export type { IResultVerificationRepository } from './domain/IResultVerificationRepository';
export { QualificationResultVerificationSource } from './infra/QualificationResultVerificationSource';
export { FinalResultVerificationSource } from './infra/FinalResultVerificationSource';
