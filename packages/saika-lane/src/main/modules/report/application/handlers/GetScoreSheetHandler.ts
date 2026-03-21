// SPDX-License-Identifier: MIT
import type { GetScoreSheetInput } from '@/main/composition/tokens';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { QueryHandler } from '@/main/shared-infra/cqrs';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';
import type { Discipline } from '@/shared/ipc/contracts';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { ScoreSheetDto, ScoreSheetShotDto } from '../dto';

/**
 * createGetScoreSheetHandler (score sheet retrieval handler factory)
 *
 * @param sessionRepo - Session repository
 * @param storage - Local storage (used to retrieve lane number)
 * @returns QueryHandler
 */
export function createGetScoreSheetHandler(
  sessionRepo: ISessionRepository,
  storage: ILocalStorage,
): QueryHandler<GetScoreSheetInput, ScoreSheetDto> {
  return async (input) => {
    const session = await sessionRepo.findById(input.sessionId);

    if (!session) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }

    // Retrieve lane number from user preferences
    const prefs = storage.get<{ laneNumber?: number }>('userPreferences');
    const laneNumber = prefs?.laneNumber ?? 1;

    // Extract match shots only
    const matchShots = session.matchShots;

    // Group by series and assign sequential numbers within each series
    const seriesMap = new Map<number, (typeof matchShots)[number][]>();
    for (const shot of matchShots) {
      const shots = seriesMap.get(shot.seriesNumber) ?? [];
      shots.push(shot);
      seriesMap.set(shot.seriesNumber, shots);
    }

    const allShots: ScoreSheetShotDto[] = [];
    for (const [seriesNum, shots] of seriesMap) {
      shots.forEach((shot, idx) => {
        allShots.push({
          shotNumber: idx + 1,
          value: shot.score.value,
          integerValue: Math.floor(shot.score.value / 10),
          seriesNumber: seriesNum,
          x: shot.impactPoint?.x ?? null,
          y: shot.impactPoint?.y ?? null,
        });
      });
    }

    // Calculate series scores (only series that have shots)
    const seriesScores = session.series.filter((series) => series.count > 0).map((series) => series.total);

    // Integer total
    const totalIntegerScore = matchShots.reduce((sum, shot) => sum + Math.floor(shot.score.value / 10), 0);

    return {
      sessionId: session.id,
      laneNumber,
      relay: 0,
      playerName: '',
      affiliation: '',
      allShots,
      seriesScores,
      totalScore: session.totalScore,
      totalIntegerScore,
      disciplineName: session.discipline.displayName,
      discipline: session.discipline.value as Discipline,
    };
  };
}
