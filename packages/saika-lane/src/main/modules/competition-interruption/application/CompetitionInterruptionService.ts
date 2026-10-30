import { SwitchModeToken } from '@/main/composition/tokens';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

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
    private readonly sessionRepository: ISessionRepository,
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
    if (existing?.restartHold) {
      const adopted = LaneInterruptionRecord.create({
        ...existing,
        interruptionId: input.interruptionId,
        resumeAt: undefined,
        authorizedRemainingSeconds: undefined,
        unlimitedSightingShots: undefined,
        restartHold: false,
      });
      this.repository.save(adopted);
      this.emit(adopted);
      return adopted;
    }
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
    if (current.restartHold) throw new Error('Apply an official Lane pause before resuming the saved run');
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

    let competition = await this.requireActiveCompetition(input.competitionId);
    if (
      input.unlimitedSightingShots &&
      competition.phase === 'ACTIVE' &&
      competition.currentStageConfig.scored &&
      competition.seriesShotCount === 0 &&
      competition.currentSeriesConfig.targetModeControl === 'ATHLETE' &&
      competition.currentSeriesConfig.purpose !== 'POSITION_CHANGE_AND_SIGHTING'
    ) {
      competition = competition.resetAthleteTargetToSighting({
        competitionId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
      });
      await this.competitionRepository.save(competition);
    }
    await this.commandBus.execute(SwitchModeToken, {
      sessionId: competition.sessionId,
      preserveSeries: true,
      mode: await this.resumedMode(competition, pending),
    });
    await this.timerService.resumeAt(
      input.competitionId,
      input.timerStartAt.toISOString(),
      input.authorizedRemainingSeconds,
    );
    const afterResume = await this.competitionRepository.findById(input.competitionId);
    if (!afterResume || !afterResume.canUpdateTimer()) {
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
    if (current.restartHold) throw new Error('Apply an official Lane pause before resuming the saved run');
    if (current.status === 'RUNNING_MATCH') return current;
    if (current.status !== 'SIGHTING') throw new Error('MATCH fire can only resume after authorized sighting shots');

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
    const competition = await this.requireActiveCompetition(input.competitionId);
    this.repository.save(applied);
    await this.commandBus.execute(SwitchModeToken, {
      sessionId: competition.sessionId,
      mode: await this.resumedMode(competition, applied),
      preserveSeries: true,
    });
    this.emit(applied);
    return applied;
  }

  /** Stop the saved ordinary clock; an open official case keeps its identity. */
  async holdAfterRestart(competition: CompetitionState, remainingSeconds: number, verified: boolean): Promise<void> {
    const current = this.repository.findByCompetitionId(competition.id);
    const openCase = current?.status === 'PAUSED' || current?.status === 'RESUME_PENDING';
    const captured = current?.status === 'PAUSED' ? current.capturedRemainingSeconds : remainingSeconds;
    this.timerService.stop();
    const record = LaneInterruptionRecord.create({
      competitionId: competition.id,
      interruptionId: openCase ? current.interruptionId : crypto.randomUUID(),
      status: 'PAUSED',
      pausedAt: openCase ? current.pausedAt : new Date(),
      capturedAt: current?.status === 'PAUSED' ? current.capturedAt : new Date(),
      capturedRemainingSeconds: captured,
      capturedTotalSeconds:
        current?.status === 'PAUSED' ? current.capturedTotalSeconds : competition.timer.totalSeconds,
      restartHold: openCase ? current.restartHold : true,
    });
    // Save the hold before the timer snapshot, so an interrupted write cannot restart the clock.
    this.repository.save(record);
    await this.competitionRepository.save(competition.replaceTimer(captured, record.capturedTotalSeconds));
    if (!verified && !openCase) {
      // The official receives a capture, never an automatically awarded duration.
      getLogger().warn(
        'Saved clock deadline unavailable; the captured remaining time requires official verification',
        'domain',
      );
    }
    this.emit(record);
  }

  get(competitionId: string): LaneInterruptionRecord | null {
    return this.repository.findByCompetitionId(competitionId);
  }

  clear(competitionId: string): void {
    this.repository.delete(competitionId);
  }

  private async resumedMode(competition: CompetitionState, interruption: LaneInterruptionRecord): Promise<Mode> {
    const session = await this.sessionRepository.findById(competition.sessionId);
    if (!session) throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    return Mode.fromValue(resolveCompetitionTargetMode(competition, session.allShots, interruption).effective);
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
    if (!competition.canUpdateTimer()) throw new Error(`Competition ${competitionId} is not active`);
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
