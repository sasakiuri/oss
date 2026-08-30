export { teamResultsModule } from './teamResults.module';
export { TeamResultsService } from './application/TeamResultsService';
export type { ITeamTieBreakPolicyResolver } from './application/TeamResultPorts';
export * from './domain/TeamResultPolicy';
export { CompetitionTypeTeamTieBreakPolicyResolver } from './infra/CompetitionTypeTeamTieBreakPolicyResolver';
export type {
  IMixedTeamFinalResultRepository,
  MixedTeamFinalMemberResult,
  MixedTeamFinalResultRecord,
} from './domain/IMixedTeamFinalResultRepository';
export { SqliteMixedTeamFinalResultRepository } from './infra/SqliteMixedTeamFinalResultRepository';
