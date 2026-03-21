// SPDX-License-Identifier: MIT
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { RoundConfig } from '@/main/modules/competition/domain/CompetitionTypeDefinition';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { Phase } from '@/main/modules/competition/domain/Phase';
import { Timer } from '@/main/modules/competition/domain/Timer';
import { withRepositoryErrorHandling } from '@/shared/errors/withRepositoryErrorHandling';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/**
 * Serialization format for CompetitionState storage
 */
interface CompetitionStorageData {
  id: string;
  sessionId: string;
  config: RoundConfig;
  phase: Phase;
  currentStageIndex: number;
  currentSeriesIndex: number;
  seriesShotCount: number;
  timerRemaining: number;
  timerTotal: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/**
 * CompetitionRepositoryImpl
 *
 * Persistence implementation for CompetitionState.
 * Uses electron-store (LocalStorageAdapter).
 */
export class CompetitionRepositoryImpl implements ICompetitionRepository {
  private static readonly STORAGE_PREFIX = 'competition:';
  private static readonly ACTIVE_KEY = 'competition:active';

  constructor(private readonly storage: ILocalStorage) {
    Object.freeze(this);
  }

  async save(state: CompetitionState): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(state.id);
        const data = this.toStorageData(state);

        if (state.phase !== 'FINISHED') {
          this.storage.setMany({
            [key]: data,
            [CompetitionRepositoryImpl.ACTIVE_KEY]: state.id,
          });
        } else {
          this.storage.set(key, data);
          this.storage.delete(CompetitionRepositoryImpl.ACTIVE_KEY);
        }
      },
      'REPOSITORY_ERROR',
      { competitionId: state.id, operation: 'save' },
    );
  }

  async findById(id: string): Promise<CompetitionState | null> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        const raw = this.storage.get<CompetitionStorageData>(key);
        if (!raw) return null;
        return this.toDomainEntity(raw);
      },
      'REPOSITORY_ERROR',
      { competitionId: id, operation: 'findById' },
    );
  }

  async findBySessionId(sessionId: string): Promise<CompetitionState | null> {
    return withRepositoryErrorHandling(
      async () => {
        const allData = this.storage.getAll();
        for (const [key, value] of Object.entries(allData)) {
          if (
            key.startsWith(CompetitionRepositoryImpl.STORAGE_PREFIX) &&
            key !== CompetitionRepositoryImpl.ACTIVE_KEY
          ) {
            const data = value as CompetitionStorageData;
            if (data.sessionId === sessionId) {
              return this.toDomainEntity(data);
            }
          }
        }
        return null;
      },
      'REPOSITORY_ERROR',
      { sessionId, operation: 'findBySessionId' },
    );
  }

  async findActive(): Promise<CompetitionState | null> {
    return withRepositoryErrorHandling(
      async () => {
        const activeId = this.storage.get<string>(CompetitionRepositoryImpl.ACTIVE_KEY);
        if (!activeId) return null;
        return await this.findById(activeId);
      },
      'REPOSITORY_ERROR',
      { operation: 'findActive' },
    );
  }

  async delete(id: string): Promise<void> {
    return withRepositoryErrorHandling(
      async () => {
        const key = this.getStorageKey(id);
        this.storage.delete(key);

        const activeId = this.storage.get<string>(CompetitionRepositoryImpl.ACTIVE_KEY);
        if (activeId === id) {
          this.storage.delete(CompetitionRepositoryImpl.ACTIVE_KEY);
        }
      },
      'REPOSITORY_ERROR',
      { competitionId: id, operation: 'delete' },
    );
  }

  private getStorageKey(id: string): string {
    return `${CompetitionRepositoryImpl.STORAGE_PREFIX}${id}`;
  }

  private toStorageData(state: CompetitionState): CompetitionStorageData {
    return {
      id: state.id,
      sessionId: state.sessionId,
      config: state.config,
      phase: state.phase,
      currentStageIndex: state.currentStageIndex,
      currentSeriesIndex: state.currentSeriesIndex,
      seriesShotCount: state.seriesShotCount,
      timerRemaining: state.timer.remainingSeconds,
      timerTotal: state.timer.totalSeconds,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    };
  }

  private toDomainEntity(data: CompetitionStorageData): CompetitionState {
    return CompetitionState.reconstruct({
      id: data.id,
      sessionId: data.sessionId,
      config: data.config,
      phase: data.phase,
      currentStageIndex: data.currentStageIndex,
      currentSeriesIndex: data.currentSeriesIndex,
      seriesShotCount: data.seriesShotCount,
      timer: Timer.reconstruct(data.timerRemaining, data.timerTotal),
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
    });
  }
}
