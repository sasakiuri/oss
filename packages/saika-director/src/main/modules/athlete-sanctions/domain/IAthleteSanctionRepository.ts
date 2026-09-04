import type { AthleteIdentity } from './AthleteIdentity';
import type { AthleteIdentityLinkEntry } from './AthleteIdentityLink';
import type { SanctionDecision } from './SanctionDecision';

export interface IAthleteSanctionRepository {
  appendIdentity(identity: AthleteIdentity): void;
  findIdentityById(id: string): AthleteIdentity | null;
  findIdentitiesByChampionship(championshipId: string): AthleteIdentity[];
  appendLinkEntry(entry: AthleteIdentityLinkEntry): void;
  findLinkEntryById(id: string): AthleteIdentityLinkEntry | null;
  findLinkEntriesByChampionship(championshipId: string): AthleteIdentityLinkEntry[];
  appendDecision(decision: SanctionDecision): void;
  findDecisionById(id: string): SanctionDecision | null;
  findDecisionsByChampionship(championshipId: string): SanctionDecision[];
  executeInTransaction<T>(operation: () => T): T;
}
