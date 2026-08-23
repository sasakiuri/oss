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

import type { Discipline } from '@/main/modules/session/domain/Discipline';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ErrorCatalog } from '@/shared/errors/ErrorCatalog';

export class SessionContextCache {
  private cachedDiscipline: Discipline | null = null;
  private cachedMode: Mode | null = null;

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
  async bootstrap(sessionRepository: ISessionRepository): Promise<void> {
    const activeSession = await sessionRepository.findActive();
    if (activeSession) {
      this.cachedDiscipline = activeSession.discipline;
      this.cachedMode = activeSession.mode;
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
    };

    this.eventBus.on('SessionStarted', (event) => {
      this.cachedDiscipline = event.discipline;
      this.cachedMode = Mode.sighting();
      onSessionReset();
    });

    this.eventBus.on('ModeSwitched', (event) => {
      this.cachedMode = event.newMode;
    });

    this.eventBus.on('StageAdvanced', (event) => {
      updateCompetitionMode(event.scored);
    });

    this.eventBus.on('PhaseChanged', (event) => {
      updateCompetitionMode(event.scored);
    });

    this.eventBus.on('SessionReset', () => {
      this.cachedDiscipline = null;
      this.cachedMode = null;
      onSessionReset();
    });
  }
}
