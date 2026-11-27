// SPDX-License-Identifier: MIT
import { emitPhaseChanged } from '@/main/modules/competition/application/emitPhaseChanged';
import { emitSeriesCompleted } from '@/main/modules/competition/application/emitSeriesCompleted';
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { Session } from '@/main/modules/session/domain/Session';
import type { Shot } from '@/main/modules/session/domain/Shot';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import {
  assertBoundToInterruptedSeries,
  compareRecordedShots,
  resolveQualificationRecoveryPlacement,
  type InterruptedSeriesBinding,
  type InterruptedSeriesWording,
} from '../domain/QualificationRecoveryPlacement';

/** Loads the competition and checks that it still sits at the interrupted series. */
export async function findBoundCompetition(
  competitionRepository: ICompetitionRepository,
  binding: InterruptedSeriesBinding,
  wording: InterruptedSeriesWording,
): Promise<CompetitionState> {
  const competition = await competitionRepository.findById(binding.competitionId);
  if (!competition) throw new Error(`Competition not found: ${binding.competitionId}`);
  assertBoundToInterruptedSeries(competition, binding, wording);
  return competition;
}

/**
 * Reads the open session of a bound competition and the MATCH shots recorded in the interrupted
 * series, after checking that every earlier series slot of the session is filled.
 */
export async function readInterruptedSeriesShots(
  sessionRepository: ISessionRepository,
  competition: CompetitionState,
  expectedRecordedShots: number,
): Promise<{
  session: Session;
  placement: ReturnType<typeof resolveQualificationRecoveryPlacement>;
  recordedShots: Shot[];
}> {
  const session = await sessionRepository.findById(competition.sessionId);
  if (!session) throw new Error(`Session not found: ${competition.sessionId}`);
  if (session.isFinished) throw new Error(`Session ${session.id} is already finished`);
  const placement = resolveQualificationRecoveryPlacement(competition);
  const matchShots = [...session.matchShots].sort(compareRecordedShots);
  const expectedVisibleShots = placement.priorShots + expectedRecordedShots;
  if (matchShots.length !== expectedVisibleShots) {
    throw new Error(
      `Session has ${matchShots.length} MATCH shot(s), but ${expectedVisibleShots} are required at the interrupted position`,
    );
  }
  return { session, placement, recordedShots: matchShots.slice(placement.priorShots) };
}

/**
 * Applies a recorded recovery decision to the competition while it still sits at the decided
 * series, announces the completed series, and clears the Lane interruption the decision closed.
 */
export async function reconcileRecoveredSeries(
  deps: {
    readonly competitionRepository: ICompetitionRepository;
    readonly interruptionControl: Pick<ICompetitionInterruptionControl, 'get' | 'clear'>;
    readonly eventBus: IEventBus;
  },
  record: {
    readonly competitionId: string;
    readonly interruptionId: string;
    readonly stageIndex: number;
    readonly seriesIndex: number;
  },
  wording: InterruptedSeriesWording,
  transition: (state: CompetitionState) => CompetitionState,
): Promise<void> {
  const state = await deps.competitionRepository.findById(record.competitionId);
  if (!state) throw new Error(`Competition not found: ${record.competitionId}`);
  const comparison = state.comparePosition(record.stageIndex, record.seriesIndex);
  if (state.phase !== 'FINISHED' && comparison < 0) {
    throw new Error(`Competition ${state.id} is behind the ${wording.action} recovery position`);
  }
  if (state.phase !== 'FINISHED' && comparison === 0) {
    const updated = transition(state);
    if (updated !== state) {
      await deps.competitionRepository.save(updated);
      if (updated.phase !== state.phase) emitPhaseChanged(deps.eventBus, updated, state.phase);
      emitSeriesCompleted(deps.eventBus, updated);
    }
  }
  const interruption = deps.interruptionControl.get(record.competitionId);
  if (interruption?.interruptionId === record.interruptionId) {
    deps.interruptionControl.clear(record.competitionId);
  }
}
