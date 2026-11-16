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

/** A stage session recorded for a competition, in recording order. */
export interface CompetitionSessionLink {
  readonly sessionId: string;
  readonly stage: number;
}

/**
 * Synchronous enumeration of stored competitions for read models that show every run, such as the
 * Vista source. Implemented by the same store as {@link ICompetitionRepository}.
 */
export interface ICompetitionCatalog {
  /** Ids of every stored competition, in storage order. */
  listIds(): string[];
  /** The active competition id when its stored record exists; the record is not reconstructed. */
  activeId(): string | null;
  /** The stage sessions recorded for a competition, or null when none were recorded. */
  sessionLinks(id: string): CompetitionSessionLink[] | null;
}
