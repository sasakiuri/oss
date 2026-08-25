// SPDX-License-Identifier: MIT
/**
 * SessionContextCache
 *
 * Manages the cache of session context (discipline/mode).
 * Used by USBDataPipeline to synchronously access session information.
 *
 * Automatically updates the cache via event subscriptions,
 * and bootstraps from the persisted active session on app restart.
 */

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export class SessionContextCache {
  private cachedDiscipline: Discipline | null = null;
  private cachedMode: Mode | null = null;
  private modeRevision = 0;

  constructor(private readonly eventBus: IEventBus) {}

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
  ): Promise<void> {
    const initialModeRevision = this.modeRevision;
    const [activeCompetition, fallbackSession] = await Promise.all([
      competitionRepository?.findActive() ?? Promise.resolve(null),
      sessionRepository.findActive(),
    ]);
    const activeSession = activeCompetition
      ? await sessionRepository.findById(activeCompetition.sessionId)
      : fallbackSession;

    if (activeSession) {
      // An event may have populated a newer session while repository reads were
      // in flight. Never replace that discipline with the stale bootstrap row.
      this.cachedDiscipline ??= activeSession.discipline;

      // Competition stages change the effective shot mode without mutating the
      // Session row. Restore from the persisted competition after app restart,
      // unless a newer event already supplied the mode while bootstrap waited.
      if (this.modeRevision === initialModeRevision) {
        this.cachedMode = activeCompetition
          ? activeCompetition.currentStageConfig.scored
            ? Mode.match()
            : Mode.sighting()
          : activeSession.mode;
      }
    }
  }

  /**
   * Subscribe to session-related events and automatically update the cache
   *
   * @param onSessionReset - Callback invoked when a session starts or resets
   */
  subscribeEvents(onSessionReset: () => void): void {
    const updateCompetitionMode = (scored: boolean): void => {
      this.cachedMode = scored ? Mode.match() : Mode.sighting();
      this.modeRevision += 1;
    };

    this.eventBus.on('SessionStarted', (event) => {
      this.cachedDiscipline = event.discipline;
      this.cachedMode = Mode.sighting();
      this.modeRevision += 1;
      onSessionReset();
    });

    this.eventBus.on('ModeSwitched', (event) => {
      this.cachedMode = event.newMode;
      this.modeRevision += 1;
    });

    this.eventBus.on('StageAdvanced', (event) => {
      updateCompetitionMode(event.scored);
    });

    this.eventBus.on('PhaseChanged', (event) => {
      updateCompetitionMode(event.scored);
    });

    this.eventBus.on('SessionReset', () => {
      // Reset clears shooting data, not the active session context. Keeping
      // discipline and mode allows the target pipeline to accept new shots.
      onSessionReset();
    });
  }
}
