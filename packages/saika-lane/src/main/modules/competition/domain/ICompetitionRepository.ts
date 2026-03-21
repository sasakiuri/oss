// SPDX-License-Identifier: MIT
import type { CompetitionState } from './CompetitionState';

/**
 * ICompetitionRepository — competition state repository interface
 *
 * Contract for the repository responsible for persisting and retrieving CompetitionState.
 */
export interface ICompetitionRepository {
  save(state: CompetitionState): Promise<void>;
  findById(id: string): Promise<CompetitionState | null>;
  findBySessionId(sessionId: string): Promise<CompetitionState | null>;
  findActive(): Promise<CompetitionState | null>;
  delete(id: string): Promise<void>;
}
