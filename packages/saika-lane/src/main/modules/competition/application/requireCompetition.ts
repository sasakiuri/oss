// SPDX-License-Identifier: MIT
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

/** Loads a competition by ID, or throws COMPETITION_NOT_FOUND. */
export async function requireCompetition(
  competitions: Pick<ICompetitionRepository, 'findById'>,
  competitionId: string,
): Promise<CompetitionState> {
  const state = await competitions.findById(competitionId);
  if (!state) throw ErrorCatalog.createError('COMPETITION_NOT_FOUND', { id: competitionId });
  return state;
}
