import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';

import type { ISafetyTimerFreezer } from '../domain/ILaneSafetyStopControl';

/** Adapter that freezes a running competition without owning its restart policy. */
export class CompetitionSafetyTimerFreezer implements ISafetyTimerFreezer {
  constructor(
    private readonly competitionRepository: ICompetitionRepository,
    private readonly timerService: LaneTimerService,
  ) {}

  async freeze(): Promise<{
    competitionId: string;
    remainingSeconds: number;
    totalSeconds: number;
    frozenAt: Date;
  } | null> {
    const competition = await this.competitionRepository.findActive();
    if (!competition || competition.phase !== 'ACTIVE') {
      this.timerService.stop();
      return null;
    }

    try {
      const captured = await this.timerService.pause(competition.id);
      return { competitionId: competition.id, ...captured, frozenAt: new Date() };
    } catch (error) {
      // Even if exact persistence fails, fail closed in memory.
      this.timerService.stop();
      throw error;
    }
  }
}
