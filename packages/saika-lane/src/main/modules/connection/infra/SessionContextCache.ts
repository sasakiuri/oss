// SPDX-License-Identifier: MIT
/**
 * Caches the active discipline and mode for synchronous access by USBDataPipeline.
 * Restores the saved session at startup and updates from session events.
 */

import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IShotObservationRepository } from '@/main/modules/shot-observation/domain/IShotObservationRepository';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export class SessionContextCache {
  private cachedDiscipline: Discipline | null = null;
  private cachedMode: Mode | null = null;
  private modeRevision = 0;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly observations: Pick<IShotObservationRepository, 'findBySessionAndOutcome'>,
  ) {}

  /**
   * Get the current session context
   *
   * @returns discipline and mode pair
   * @throws SESSION_NOT_FOUND - If no session has been started
   */
  getContext(): { discipline: Discipline; mode: Mode } {
    if (!this.cachedDiscipline || !this.cachedMode) {
      throw ErrorCatalog.createError('SESSION_NOT_FOUND');
    }
    return { discipline: this.cachedDiscipline, mode: this.cachedMode };
  }

  /**
   * Bootstrap the cache from the persisted active session
   *
   * Restores the cache before events fire in the app restart scenario.
   */
  async bootstrap(
    sessionRepository: ISessionRepository,
    competitionRepository?: ICompetitionRepository,
    interruptions?: Pick<ICompetitionInterruptionControl, 'get'>,
  ): Promise<Mode | null> {
    const initialModeRevision = ++this.modeRevision;
    let resetRecovered = false;
    let activeCompetition = (await competitionRepository?.findActive()) ?? null;
    const activeSession = activeCompetition
      ? await sessionRepository.findById(activeCompetition.sessionId)
      : await sessionRepository.findActive();
    if (activeCompetition && !activeSession) throw ErrorCatalog.createError('SESSION_NOT_FOUND');

    if (
      activeCompetition &&
      activeSession &&
      competitionRepository &&
      resolveCompetitionTargetMode(
        activeCompetition,
        activeSession.allShots,
        interruptions?.get(activeCompetition.id) ?? null,
      ).sightingRequired
    ) {
      const extras = await this.observations.findBySessionAndOutcome(activeSession.id, 'NULLIFIED_POSITION_EXTRA');
      if (
        extras.some(
          (extra) =>
            extra.competition?.competitionId === activeCompetition!.id &&
            extra.competition.stageIndex === activeCompetition!.currentStageIndex &&
            extra.competition.seriesIndex === activeCompetition!.currentSeriesIndex,
        )
      ) {
        // Retry only a reset whose durable observation belongs to this still-unswitched series.
        const current = await competitionRepository.findById(activeCompetition.id);
        if (
          current &&
          resolveCompetitionTargetMode(current, activeSession.allShots, interruptions?.get(current.id) ?? null)
            .sightingRequired
        ) {
          activeCompetition = current.resetAthleteTargetToSighting({
            competitionId: current.id,
            stageIndex: activeCompetition.currentStageIndex,
            seriesIndex: activeCompetition.currentSeriesIndex,
          });
          await competitionRepository.save(activeCompetition);
          resetRecovered = true;
        }
      }
    }

    if (activeSession) {
      // An event may have populated a newer session while repository reads were
      // in flight. Never replace that discipline with the stale bootstrap row.
      this.cachedDiscipline ??= activeSession.discipline;

      // Competition stages change the effective shot mode without mutating the
      // Session row. Restore from the persisted competition after app restart,
      // unless a newer event already supplied the mode while bootstrap waited.
      if (this.modeRevision === initialModeRevision) {
        this.cachedMode = activeCompetition
          ? Mode.fromValue(
              resolveCompetitionTargetMode(
                activeCompetition,
                activeSession.allShots,
                interruptions?.get(activeCompetition.id) ?? null,
              ).effective,
            )
          : activeSession.mode;
        if (resetRecovered && activeCompetition)
          this.eventBus.emit({
            type: 'PositionExtraNullified',
            aggregateId: activeSession.id,
            competitionId: activeCompetition.id,
            timestamp: Date.now(),
          });
        return this.cachedMode;
      }
    }
    return null;
  }

  /**
   * Subscribe to session-related events and automatically update the cache
   *
   * @param onSessionReset - Callback invoked when a session starts or resets
   */
  subscribeEvents(onSessionReset: () => void): void {
    this.eventBus.on('SessionStarted', (event) => {
      this.cachedDiscipline = event.discipline;
      this.cachedMode = Mode.sighting();
      this.modeRevision += 1;
      onSessionReset();
    });

    this.eventBus.on('AthleteTargetModeChanged', (event) => {
      this.cachedMode = event.newMode;
      this.modeRevision += 1;
    });

    this.eventBus.on('ModeSwitched', (event) => {
      this.cachedMode = event.newMode;
      this.modeRevision += 1;
    });

    this.eventBus.on('SessionReset', () => {
      // Reset clears shooting data, not the active session context. Keeping
      // discipline and mode allows the target pipeline to accept new shots.
      onSessionReset();
    });
  }
}
