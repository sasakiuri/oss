// SPDX-License-Identifier: MIT
import { canonicalJson } from '@sasakiuri/saika-rules';

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import { Timer } from '@/main/modules/competition/domain/Timer';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Session } from '@/main/modules/session/domain/Session';
import { SessionFactory } from '@/main/modules/session/domain/SessionFactory';
import { parseSessionStorageData } from '@/main/modules/session/infra/SessionStorageSchema';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ReserveLaneTransferBundle, ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

import type { IReserveLaneTransferStatePort } from '../domain/ReserveLaneTransfer';

export interface ITransferAssignmentPort {
  read(competitionId: string): { athlete: { id: string; name: string } | null } | null;
  restore(competitionId: string, json: string | null): Promise<void>;
}

/** The first snapshot version supports continuous Qualification match timers. */
export class StoredReserveLaneTransferState implements IReserveLaneTransferStatePort {
  constructor(
    private readonly competitions: ICompetitionRepository,
    private readonly sessions: ISessionRepository,
    private readonly assignments: ITransferAssignmentPort,
    private readonly safety: Pick<ILaneSafetyStopControl, 'getState'>,
    private readonly interruptions: ICompetitionInterruptionControl,
    private readonly events: IEventBus,
  ) {}

  async assertSourceCancellable(bundle: ReserveLaneTransferBundle): Promise<void> {
    const competition = await this.competitions.findById(bundle.request.competitionId);
    const session = competition ? await this.sessions.findById(competition.sessionId) : null;
    if (!competition || competition.phase === 'FINISHED' || !session || session.finishedAt)
      throw new Error('Source retirement may have started; complete the transfer');
  }
  async capture(request: ReserveLaneTransferRequest): Promise<Omit<ReserveLaneTransferBundle, 'digest'>> {
    const stop = this.requireStop();
    const competition = await this.competitions.findActive();
    if (!competition || competition.id !== request.competitionId || competition.phase !== 'ACTIVE')
      throw new Error('An active source competition is required');
    this.requireSupported(competition);
    const interruption = this.interruptions.get(competition.id);
    if (interruption && interruption.status !== 'PAUSED')
      throw new Error('Complete the current interruption workflow before transfer');
    const session = await this.sessions.findById(competition.sessionId);
    const assignment = this.assignments.read(competition.id);
    if (!session || session.finishedAt || !assignment?.athlete?.id)
      throw new Error('Source session and athlete assignment are required');
    if (stop.timerSnapshot?.competitionId !== competition.id)
      throw new Error('The source STOP has no frozen competition timer');
    return {
      version: 1,
      request,
      sourceSafetyStopId: stop.safetyStopId,
      capturedAt: new Date().toISOString(),
      summary: {
        athleteId: assignment.athlete.id,
        athleteName: assignment.athlete.name,
        matchShots: session.matchShots.length,
        totalScoreX10: session.totalScore,
        remainingSeconds: competition.timer.remainingSeconds,
        rulePackFingerprint: competition.config.rulePackIdentity!.fingerprint.value,
      },
      competitionJson: serializeCompetition(competition),
      sessionJson: serializeSession(session),
      assignmentJson: canonicalJson(assignment),
    };
  }

  async checkTarget(bundle: ReserveLaneTransferBundle, retry: boolean): Promise<void> {
    this.requireStop();
    const competition = await this.competitions.findActive();
    if (!competition || competition.id !== bundle.request.competitionId)
      throw new Error('Join the reserve Lane to this competition before the relay starts');
    this.requireSupported(competition, false);
    const source = JSON.parse(bundle.competitionJson) as ReturnType<typeof competitionData>;
    if (canonicalJson(source.config) !== canonicalJson(competition.config))
      throw new Error('Reserve Lane Rule Pack and competition configuration must match exactly');
    const session = await this.sessions.findById(competition.sessionId);
    const assignment = this.assignments.read(competition.id);
    if (!session || (session.shotCount > 0 && (!retry || session.id !== source.sessionId)))
      throw new Error('Reserve Lane must have no existing shots');
    if (assignment?.athlete && (!retry || assignment.athlete.id !== bundle.summary.athleteId))
      throw new Error('Reserve Lane is already assigned');
    const incoming = SessionFactory.fromStorageData(parseSessionStorageData(JSON.parse(bundle.sessionJson)));
    if (
      incoming.id !== source.sessionId ||
      incoming.finishedAt ||
      incoming.totalScore !== bundle.summary.totalScoreX10 ||
      incoming.matchShots.length !== bundle.summary.matchShots
    )
      throw new Error('Transfer session does not match its summary');
    if (
      source.id !== bundle.request.competitionId ||
      source.timerRemaining !== bundle.summary.remainingSeconds ||
      source.phase !== 'ACTIVE'
    )
      throw new Error('Transfer competition state does not match its summary');
    const stored = await this.sessions.findById(incoming.id);
    if (stored && (!retry || serializeSession(stored) !== bundle.sessionJson))
      throw new Error('Incoming session identity already exists with different evidence');
  }

  async retireSource(bundle: ReserveLaneTransferBundle, retry: boolean): Promise<void> {
    const stop = this.requireStop();
    if (stop.safetyStopId !== bundle.sourceSafetyStopId)
      throw new Error('Source STOP changed after the snapshot was prepared');
    const competition = await this.competitions.findById(bundle.request.competitionId);
    if (!competition) throw new Error('Source competition is unavailable');
    const session = await this.sessions.findById(competition.sessionId);
    if (!session) throw new Error('Source session is unavailable');
    const currentCompetition = competitionData(competition);
    const sourceCompetition = JSON.parse(bundle.competitionJson) as ReturnType<typeof competitionData>;
    if (retry && competition.phase === 'FINISHED') {
      currentCompetition.phase = sourceCompetition.phase;
      currentCompetition.finishedAt = sourceCompetition.finishedAt;
    }
    const currentSession = JSON.parse(serializeSession(session)) as { finishedAt: string | null };
    if (retry && session.finishedAt) currentSession.finishedAt = null;
    if (
      canonicalJson(currentCompetition) !== bundle.competitionJson ||
      canonicalJson(currentSession) !== bundle.sessionJson
    )
      throw new Error('Source changed after snapshot preparation; preserve both Lanes for review');
    const assignment = this.assignments.read(competition.id);
    if ((!retry || assignment?.athlete) && canonicalJson(assignment) !== bundle.assignmentJson)
      throw new Error('Source athlete assignment changed');
    if (!session.finishedAt) await this.sessions.save(session.finish());
    if (competition.phase !== 'FINISHED') await this.competitions.save(competition.finish());
    await this.assignments.restore(competition.id, null);
  }

  async activateTarget(bundle: ReserveLaneTransferBundle, _retry: boolean): Promise<void> {
    this.requireStop();
    const old = await this.competitions.findActive();
    const source = JSON.parse(bundle.competitionJson) as ReturnType<typeof competitionData>;
    const session = SessionFactory.fromStorageData(parseSessionStorageData(JSON.parse(bundle.sessionJson)));
    if (old?.sessionId !== session.id) {
      const empty = old ? await this.sessions.findById(old.sessionId) : null;
      if (empty) await this.sessions.save(empty.finish());
    }
    await this.sessions.save(session);
    const competition = CompetitionState.reconstruct({
      ...source,
      timer: Timer.reconstruct(source.timerRemaining, source.timerTotal),
    });
    await this.competitions.save(competition);
    await this.assignments.restore(competition.id, bundle.assignmentJson);
    await this.interruptions.pause({
      competitionId: competition.id,
      interruptionId: bundle.request.id,
      pausedAt: new Date(bundle.capturedAt),
    });
    this.events.emit({
      type: 'SessionStarted',
      timestamp: Date.now(),
      aggregateId: session.id,
      discipline: session.discipline,
    });
    // No phase-start event: the imported timer must remain stopped until a separate grant.
  }

  private requireStop() {
    const state = this.safety.getState();
    if (state?.status !== 'STOPPED') throw new Error('Apply and retain the Lane safety STOP before transferring state');
    return state;
  }
  private requireSupported(competition: CompetitionState, requireMatch = true) {
    const stages = competition.config.stages.filter((stage) => stage.scored);
    if (
      !competition.config.rulePackIdentity ||
      competition.config.timedTarget ||
      stages.length !== 1 ||
      !stages[0]!.timer ||
      stages[0]!.series.some((series) => series.timer || series.shotTimer) ||
      (requireMatch &&
        (!competition.currentStageConfig.scored ||
          competition.currentSeriesConfig.purpose === 'POSITION_CHANGE_AND_SIGHTING' ||
          competition.currentSeriesConfig.maxShots < 1))
    )
      throw new Error('This transfer version requires a Rule Pack with one continuous Qualification MATCH stage');
  }
}
function competitionData(value: CompetitionState) {
  return {
    id: value.id,
    sessionId: value.sessionId,
    config: value.config,
    phase: value.phase,
    currentStageIndex: value.currentStageIndex,
    currentSeriesIndex: value.currentSeriesIndex,
    seriesShotCount: value.seriesShotCount,
    timerRemaining: value.timer.remainingSeconds,
    timerTotal: value.timer.totalSeconds,
    startedAt: value.startedAt,
    finishedAt: value.finishedAt,
  };
}
function serializeCompetition(value: CompetitionState): string {
  return canonicalJson(competitionData(value));
}
function serializeSession(value: Session): string {
  return canonicalJson({
    id: value.id,
    discipline: value.discipline.value,
    mode: value.mode.value,
    startedAt: value.startedAt.toISOString(),
    finishedAt: value.finishedAt?.toISOString() ?? null,
    scoringMode: value.scoringMode,
    series: value.series.map((series) => ({
      seriesNumber: series.seriesNumber,
      totalScore: series.total,
      maxShots: series.maxShots,
    })),
    allShots: value.allShots.map((shot) => ({
      id: shot.id,
      shotNumber: shot.shotNumber,
      impactPoint: shot.impactPoint ? { x: shot.impactPoint.x, y: shot.impactPoint.y } : null,
      score: shot.score.value,
      innerTen: shot.innerTen,
      timestamp: shot.timestamp.toISOString(),
      seriesNumber: shot.seriesNumber,
      mode: shot.mode.value,
      ...(shot.deviceScore ? { deviceScore: shot.deviceScore.value } : {}),
      calculatedScore: shot.calculatedScore.value,
      receivedAt: shot.receivedAt.toISOString(),
      ...(shot.sourceObservationId ? { sourceObservationId: shot.sourceObservationId } : {}),
      ...(shot.targetProfileId ? { targetProfileId: shot.targetProfileId } : {}),
      ...(shot.scoringGaugeProfileId ? { scoringGaugeProfileId: shot.scoringGaugeProfileId } : {}),
    })),
  });
}
