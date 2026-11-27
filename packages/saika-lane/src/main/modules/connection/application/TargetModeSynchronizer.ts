// SPDX-License-Identifier: MIT
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { Mode } from '@/main/modules/session/domain/Mode';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';
import { errorMessage } from '@/shared/errors/errorMessage';

/** The cached session context that USB parsing reads synchronously. */
export interface TargetModeContext {
  /** @throws SESSION_NOT_FOUND before a session is known. */
  getContext(): { mode: Mode };
  /** Re-reads the persisted competition; null when a newer event already set the mode. */
  bootstrap(
    sessionRepository: ISessionRepository,
    competitionRepository: ICompetitionRepository,
    interruptions: Pick<ICompetitionInterruptionControl, 'get'>,
  ): Promise<Mode | null>;
}

export interface TargetModeSynchronizerDeps {
  sessionContext: TargetModeContext;
  sessionRepository: ISessionRepository;
  competitionRepository: ICompetitionRepository;
  competitionInterruptionControl: Pick<ICompetitionInterruptionControl, 'get'>;
  target: { sendMode(mode: Mode): Promise<void> };
}

/**
 * Keeps the target device mode in step with the competition.
 *
 * Mode events from Range Officer switches and athlete selections are sent at
 * once. Competition progress refreshes the cached mode from persisted state in
 * one queue: stage boundaries always send the result, other notifications send
 * only a changed mode.
 */
export class TargetModeSynchronizer {
  private readonly refreshes = new SerialQueue();

  constructor(private readonly deps: TargetModeSynchronizerDeps) {}

  /** The cached mode, or Sighting before a session is known. */
  currentMode(): Mode {
    return this.cachedMode() ?? Mode.sighting();
  }

  /** Resolves once every refresh queued so far has finished. */
  settled(): Promise<void> {
    return this.refreshes.run(() => undefined);
  }

  /** Waits for queued refreshes, then sends the cached mode again without awaiting the device write. */
  async restoreAfterReconnect(): Promise<void> {
    await this.settled();
    this.deps.target.sendMode(this.currentMode()).catch((err: unknown) => {
      getLogger().warn('Failed to restore device mode after automatic USB reconnect', 'main', {
        err: errorMessage(err),
      });
    });
  }

  subscribe(eventBus: IEventBus): void {
    eventBus.on('ModeSwitched', (event) => this.sendModeEvent('ModeSwitched', event.newMode));
    eventBus.on('AthleteTargetModeChanged', (event) => this.sendModeEvent('AthleteTargetModeChanged', event.newMode));

    eventBus.on('StageAdvanced', () => this.refresh(true));
    eventBus.on('PhaseChanged', (event) => {
      this.refresh(event.previousPhase === 'IDLE' && event.newPhase === 'ACTIVE');
    });
    eventBus.on('ShotRecorded', (event) => {
      if (event.shot.mode.isSighting() && event.shot.competitionContext?.athleteModeObserved) this.refresh(false);
    });
    eventBus.on('CompetitionProgressChanged', () => this.refresh(false));
    eventBus.on('SeriesCompleted', () => this.refresh(false));
  }

  private refresh(forceSend: boolean): void {
    this.refreshes
      .run(async () => {
        const previousMode = this.cachedMode();
        const mode = await this.deps.sessionContext.bootstrap(
          this.deps.sessionRepository,
          this.deps.competitionRepository,
          this.deps.competitionInterruptionControl,
        );
        if (mode && (forceSend || mode.value !== previousMode?.value)) await this.deps.target.sendMode(mode);
      })
      .catch((err: unknown) => {
        getLogger().warn('Failed to refresh competition target mode', 'main', {
          err: errorMessage(err),
        });
      });
  }

  private sendModeEvent(eventType: 'ModeSwitched' | 'AthleteTargetModeChanged', mode: Mode): void {
    this.deps.target.sendMode(mode).catch((err: unknown) => {
      getLogger().warn(`sendMode failed on ${eventType}`, 'main', {
        mode: mode.value,
        err: errorMessage(err),
      });
    });
  }

  private cachedMode(): Mode | null {
    try {
      return this.deps.sessionContext.getContext().mode;
    } catch {
      return null;
    }
  }
}
