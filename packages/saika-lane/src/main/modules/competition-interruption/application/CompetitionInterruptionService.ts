import { SwitchModeToken } from '@/main/composition/tokens';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import type {
  ICompetitionInterruptionControl,
  PauseLaneCompetitionInput,
  ResumeLaneCompetitionInput,
  ResumeLaneMatchInput,
} from '../domain/ICompetitionInterruptionControl';
import type { ICompetitionInterruptionRepository } from '../domain/ICompetitionInterruptionRepository';
import { LaneInterruptionRecord } from '../domain/LaneInterruptionRecord';

/** Applies already-authorized interruption commands without deciding the ISSF remedy. */
export class CompetitionInterruptionService implements ICompetitionInterruptionControl {
  constructor(
    private readonly repository: ICompetitionInterruptionRepository,
    private readonly competitionRepository: ICompetitionRepository,
    private readonly timerService: LaneTimerService,
    private readonly commandBus: CommandBus,
    private readonly eventBus: IEventBus,
  ) {
    const clearCompletedInterruption = (event: { aggregateId: string }): void => {
      const current = this.repository.findByCompetitionId(event.aggregateId);
      if (current?.status === 'SIGHTING' || current?.status === 'RUNNING_MATCH') {
        this.repository.delete(event.aggregateId);
      }
    };
    eventBus.on('TimerExpired', clearCompletedInterruption);
    eventBus.on('SeriesCompleted', clearCompletedInterruption);
  }

  async pause(input: PauseLaneCompetitionInput): Promise<LaneInterruptionRecord> {
    const existing = this.repository.findByCompetitionId(input.competitionId);
    if (existing?.interruptionId === input.interruptionId) return existing;
    if (existing && existing.status !== 'RUNNING_MATCH') {
      throw new Error(`Lane is already handling interruption ${existing.interruptionId}`);
    }

    await this.requireActiveCompetition(input.competitionId);
    const captured = await this.timerService.pause(input.competitionId);
    const record = LaneInterruptionRecord.create({
      competitionId: input.competitionId,
      interruptionId: input.interruptionId,
      status: 'PAUSED',
      pausedAt: input.pausedAt,
      capturedAt: new Date(),
      capturedRemainingSeconds: captured.remainingSeconds,
      capturedTotalSeconds: captured.totalSeconds,
    });
    this.repository.save(record);
    this.emit(record);
    return record;
  }

  async resume(input: ResumeLaneCompetitionInput): Promise<LaneInterruptionRecord> {
    const current = this.requireMatching(input.competitionId, input.interruptionId);
    if (current.status === 'SIGHTING' || current.status === 'RUNNING_MATCH') return current;
    if (current.status !== 'PAUSED' && current.status !== 'RESUME_PENDING') {
      throw new Error(`Cannot resume an interruption in status ${current.status}`);
    }

    const pending = LaneInterruptionRecord.create({
      competitionId: current.competitionId,
      interruptionId: current.interruptionId,
      status: 'RESUME_PENDING',
      pausedAt: current.pausedAt,
      capturedAt: current.capturedAt,
      capturedRemainingSeconds: current.capturedRemainingSeconds,
      capturedTotalSeconds: current.capturedTotalSeconds,
      resumeAt: input.timerStartAt,
      authorizedRemainingSeconds: input.authorizedRemainingSeconds,
      unlimitedSightingShots: input.unlimitedSightingShots,
    });
    this.repository.save(pending);

    const competition = await this.requireActiveCompetition(input.competitionId);
    await this.commandBus.execute(SwitchModeToken, {
      sessionId: competition.sessionId,
      preserveSeries: true,
      mode: input.unlimitedSightingShots ? Mode.sighting() : Mode.match(),
    });
    await this.timerService.resumeAt(
      input.competitionId,
      input.timerStartAt.toISOString(),
      input.authorizedRemainingSeconds,
    );
    const afterResume = await this.competitionRepository.findById(input.competitionId);
    if (!afterResume || afterResume.phase !== 'ACTIVE') {
      this.repository.delete(input.competitionId);
      throw new Error('The authorized Lane timer expired before the resume operation completed');
    }

    const applied = LaneInterruptionRecord.create({
      competitionId: pending.competitionId,
      interruptionId: pending.interruptionId,
      status: input.unlimitedSightingShots ? 'SIGHTING' : 'RUNNING_MATCH',
      pausedAt: pending.pausedAt,
      capturedAt: pending.capturedAt,
      capturedRemainingSeconds: pending.capturedRemainingSeconds,
      capturedTotalSeconds: pending.capturedTotalSeconds,
      resumeAt: input.timerStartAt,
      authorizedRemainingSeconds: input.authorizedRemainingSeconds,
      unlimitedSightingShots: input.unlimitedSightingShots,
    });
    this.repository.save(applied);
    this.emit(applied);
    return applied;
  }

  async resumeMatch(input: ResumeLaneMatchInput): Promise<LaneInterruptionRecord> {
    const current = this.requireMatching(input.competitionId, input.interruptionId);
    if (current.status === 'RUNNING_MATCH') return current;
    if (current.status !== 'SIGHTING') throw new Error('MATCH fire can only resume after authorized sighting shots');

    const competition = await this.requireActiveCompetition(input.competitionId);
    await this.commandBus.execute(SwitchModeToken, {
      sessionId: competition.sessionId,
      mode: Mode.match(),
      preserveSeries: true,
    });
    const applied = LaneInterruptionRecord.create({
      competitionId: current.competitionId,
      interruptionId: current.interruptionId,
      status: 'RUNNING_MATCH',
      pausedAt: current.pausedAt,
      capturedAt: current.capturedAt,
      capturedRemainingSeconds: current.capturedRemainingSeconds,
      capturedTotalSeconds: current.capturedTotalSeconds,
      resumeAt: current.resumeAt ?? undefined,
      authorizedRemainingSeconds: current.authorizedRemainingSeconds ?? undefined,
      unlimitedSightingShots: current.unlimitedSightingShots ?? undefined,
    });
    this.repository.save(applied);
    this.emit(applied);
    return applied;
  }

  /** Restores a persisted pause or authorized per-Lane timer after process restart. */
  async restoreActive(): Promise<LaneInterruptionRecord | null> {
    const competition = await this.competitionRepository.findActive();
    if (!competition || competition.phase !== 'ACTIVE') return null;
    const current = this.repository.findByCompetitionId(competition.id);
    if (!current) return null;

    if (current.status === 'PAUSED') {
      this.timerService.stop();
      this.emit(current);
      return current;
    }

    if (
      current.resumeAt === null ||
      current.authorizedRemainingSeconds === null ||
      current.unlimitedSightingShots === null
    ) {
      throw new Error(`Interruption ${current.interruptionId} has incomplete resume state`);
    }

    const restoredStatus =
      current.status === 'RESUME_PENDING'
        ? current.unlimitedSightingShots
          ? 'SIGHTING'
          : 'RUNNING_MATCH'
        : current.status;
    await this.commandBus.execute(SwitchModeToken, {
      sessionId: competition.sessionId,
      preserveSeries: true,
      mode: restoredStatus === 'SIGHTING' ? Mode.sighting() : Mode.match(),
    });
    await this.timerService.resumeAt(
      current.competitionId,
      current.resumeAt.toISOString(),
      current.authorizedRemainingSeconds,
    );

    const afterRestore = await this.competitionRepository.findById(current.competitionId);
    if (!afterRestore || afterRestore.phase !== 'ACTIVE') {
      this.repository.delete(current.competitionId);
      return null;
    }

    const restored = LaneInterruptionRecord.create({
      competitionId: current.competitionId,
      interruptionId: current.interruptionId,
      status: restoredStatus,
      pausedAt: current.pausedAt,
      capturedAt: current.capturedAt,
      capturedRemainingSeconds: current.capturedRemainingSeconds,
      capturedTotalSeconds: current.capturedTotalSeconds,
      resumeAt: current.resumeAt,
      authorizedRemainingSeconds: current.authorizedRemainingSeconds,
      unlimitedSightingShots: current.unlimitedSightingShots,
    });
    this.repository.save(restored);
    this.emit(restored);
    return restored;
  }

  get(competitionId: string): LaneInterruptionRecord | null {
    return this.repository.findByCompetitionId(competitionId);
  }

  clear(competitionId: string): void {
    this.repository.delete(competitionId);
  }

  private requireMatching(competitionId: string, interruptionId: string): LaneInterruptionRecord {
    const current = this.repository.findByCompetitionId(competitionId);
    if (!current) throw new Error(`No interruption is recorded for competition ${competitionId}`);
    if (current.interruptionId !== interruptionId) {
      throw new Error(`Interruption ${interruptionId} does not match the Lane record ${current.interruptionId}`);
    }
    return current;
  }

  private async requireActiveCompetition(competitionId: string) {
    const competition = await this.competitionRepository.findById(competitionId);
    if (!competition) throw new Error(`Competition not found: ${competitionId}`);
    if (competition.phase !== 'ACTIVE') throw new Error(`Competition ${competitionId} is not active`);
    return competition;
  }

  private emit(record: LaneInterruptionRecord): void {
    this.eventBus.emit({
      type: 'CompetitionInterruptionChanged',
      timestamp: Date.now(),
      aggregateId: record.competitionId,
      interruptionId: record.interruptionId,
      status: record.status,
      remainingSeconds: record.authorizedRemainingSeconds ?? record.capturedRemainingSeconds,
      unlimitedSightingShots: record.unlimitedSightingShots === true,
    });
  }
}
