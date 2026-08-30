import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import type { ICompetitionInterruptionRepository } from '../domain/ICompetitionInterruptionRepository';
import {
  LANE_INTERRUPTION_STATUSES,
  LaneInterruptionRecord,
  type LaneInterruptionStatus,
} from '../domain/LaneInterruptionRecord';

interface StoredInterruptionRecord {
  competitionId: string;
  interruptionId: string;
  status: LaneInterruptionStatus;
  pausedAt: string;
  capturedAt: string;
  capturedRemainingSeconds: number;
  capturedTotalSeconds: number;
  resumeAt: string | null;
  authorizedRemainingSeconds: number | null;
  unlimitedSightingShots: boolean | null;
  updatedAt: string;
}

export class LocalCompetitionInterruptionRepository implements ICompetitionInterruptionRepository {
  private static readonly STORAGE_PREFIX = 'competitionInterruption:';

  constructor(private readonly storage: ILocalStorage) {}

  findByCompetitionId(competitionId: string): LaneInterruptionRecord | null {
    const raw = this.storage.get<StoredInterruptionRecord>(this.key(competitionId));
    if (!raw) return null;
    if (!LANE_INTERRUPTION_STATUSES.includes(raw.status)) throw new Error('Stored interruption status is invalid');
    return LaneInterruptionRecord.reconstruct({
      ...raw,
      pausedAt: new Date(raw.pausedAt),
      capturedAt: new Date(raw.capturedAt),
      resumeAt: raw.resumeAt ? new Date(raw.resumeAt) : null,
      updatedAt: new Date(raw.updatedAt),
    });
  }

  save(record: LaneInterruptionRecord): void {
    this.storage.set(this.key(record.competitionId), {
      competitionId: record.competitionId,
      interruptionId: record.interruptionId,
      status: record.status,
      pausedAt: record.pausedAt.toISOString(),
      capturedAt: record.capturedAt.toISOString(),
      capturedRemainingSeconds: record.capturedRemainingSeconds,
      capturedTotalSeconds: record.capturedTotalSeconds,
      resumeAt: record.resumeAt?.toISOString() ?? null,
      authorizedRemainingSeconds: record.authorizedRemainingSeconds,
      unlimitedSightingShots: record.unlimitedSightingShots,
      updatedAt: record.updatedAt.toISOString(),
    });
  }

  delete(competitionId: string): void {
    this.storage.delete(this.key(competitionId));
  }

  private key(competitionId: string): string {
    return `${LocalCompetitionInterruptionRepository.STORAGE_PREFIX}${competitionId}`;
  }
}
