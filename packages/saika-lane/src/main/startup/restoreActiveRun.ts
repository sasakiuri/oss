// SPDX-License-Identifier: MIT
import type { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { resolveCompetitionTargetMode } from '@/main/modules/competition/domain/CompetitionTargetModePolicy';
import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { SavedLaneClock, LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { CompetitionInterruptionService } from '@/main/modules/competition-interruption/application/CompetitionInterruptionService';
import type { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import type { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import { getLogger } from '@/main/shared-infra/logging/createLogger';
import type { StartupStateDto } from '@/shared/ipc/contracts/startup.contract';

interface RestoreActiveRunDeps {
  competitions: ICompetitionRepository;
  sessions: ISessionRepository;
  membership: DirectorMembership;
  timer: LaneTimerService;
  interruptions: CompetitionInterruptionService;
  safetyStopped: () => boolean;
  safetyCompetitionId: () => string | null;
  transferPending: () => boolean;
  createCompetition: () => Promise<unknown>;
  setAsideActiveRun: () => Promise<void>;
  restoreIndependentWorkflows: () => void;
  stopIndependentWorkflows: () => void;
  context: SessionContextCache;
}

/** Main owns the startup decision. Renderer emptiness never creates or replaces a run. */
export class ActiveRunStartup {
  private unreadableSavedRun = false;
  private unknownCompetitionType = false;
  private readonly readyCallbacks: Array<() => Promise<void>> = [];
  private inFlight: Promise<StartupStateDto> | null = null;
  private state: StartupStateDto = {
    status: 'ERROR',
    error: 'Startup has not completed',
    competitionId: null,
    sessionId: null,
    currentSeriesStartIndex: 0,
    canFinish: false,
  };

  constructor(private readonly deps: RestoreActiveRunDeps) {}

  afterReady(callback: () => Promise<void>): void {
    this.readyCallbacks.push(callback);
  }

  isReady(): boolean {
    return this.state.status === 'READY';
  }

  async setAsideSavedRun(): Promise<StartupStateDto> {
    const state = await this.snapshot();
    if (state.status !== 'ERROR' || !state.canSetAside || !this.recoveryAllowed())
      throw new Error('The saved run cannot be set aside while another owner controls it');
    await this.deps.setAsideActiveRun();
    this.unreadableSavedRun = false;
    this.state = { ...this.state, competitionId: null, sessionId: null, canSetAside: false, canFinish: false };
    return this.snapshot();
  }

  restore(): Promise<StartupStateDto> {
    if (this.inFlight) return this.inFlight;
    if (this.isReady()) return this.snapshot();
    this.inFlight ??= this.restoreInternal()
      .then((state) => {
        if (state.status === 'READY') {
          for (const callback of this.readyCallbacks)
            void callback().catch((error: unknown) => {
              getLogger().error('Startup auto-connect failed', 'main', {
                error: error instanceof Error ? error.message : String(error),
              });
            });
        }
        return state;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  async snapshot(): Promise<StartupStateDto> {
    if (this.inFlight) await this.inFlight;
    if (this.state.status === 'ERROR')
      return {
        ...this.state,
        canFinish: !this.unreadableSavedRun && this.canFinish(),
        canSetAside: this.unreadableSavedRun && this.recoveryAllowed(),
        canChooseType: this.unknownCompetitionType && this.recoveryAllowed(),
      };
    const active = await this.deps.competitions.findActive();
    const saved =
      active ?? (this.state.competitionId ? await this.deps.competitions.findById(this.state.competitionId) : null);
    if (saved) this.state = await this.describe(saved, null);
    return this.state;
  }

  private recoveryAllowed(): boolean {
    return (
      this.deps.membership.snapshot.competitionId === null && !this.deps.safetyStopped() && !this.deps.transferPending()
    );
  }

  private canFinish(): boolean {
    return (
      this.state.competitionId !== null &&
      this.state.sessionId !== null &&
      this.deps.membership.snapshot.competitionId === null &&
      !this.deps.safetyStopped() &&
      !this.deps.transferPending()
    );
  }

  private async describe(active: CompetitionState, error: string | null): Promise<StartupStateDto> {
    const session = await this.deps.sessions.findById(active.sessionId);
    if (!session) throw new Error(`Saved session ${active.sessionId} is missing`);
    const first = session.allShots.findIndex(
      (shot) =>
        shot.competitionContext?.competitionId === active.id &&
        shot.competitionContext.stageIndex === active.currentStageIndex &&
        shot.competitionContext.seriesIndex === active.currentSeriesIndex,
    );
    return {
      status: error ? 'ERROR' : 'READY',
      error,
      competitionId: active.id,
      sessionId: active.sessionId,
      currentSeriesStartIndex: first < 0 ? session.allShots.length : first,
      canFinish:
        active.phase !== 'FINISHED' &&
        this.deps.membership.snapshot.competitionId === null &&
        !this.deps.safetyStopped() &&
        !this.deps.transferPending(),
    };
  }

  private async restoreInternal(): Promise<StartupStateDto> {
    const { competitions, sessions, membership, timer, interruptions } = this.deps;
    let clockToRestore: SavedLaneClock | null = null;
    let clockArmed = false;
    this.unknownCompetitionType = false;
    this.unreadableSavedRun = true;
    this.state = { ...this.state, error: null, competitionId: null, sessionId: null, canFinish: false };
    try {
      let active = await competitions.findActive();
      this.unreadableSavedRun = false;
      const joined = membership.snapshot.competitionId;
      if (!active && this.deps.transferPending())
        throw new Error('Complete the pending reserve transfer before restoring the run');
      if (!active && joined) {
        // A final snapshot/leave retry still belongs to its saved finished run.
        active = await competitions.findById(joined);
        if (!active) throw new Error(`Saved Director competition ${joined} is missing`);
        if (active.phase !== 'FINISHED') throw new Error('Director membership has no matching active competition');
      }
      if (!active) {
        timer.savedClock(null);
        await this.deps.createCompetition();
        active = await competitions.findActive();
      }
      if (!active) throw new Error('The startup competition was not saved');
      this.unreadableSavedRun = true;
      this.state = { ...this.state, competitionId: active.id, sessionId: active.sessionId };
      // Access the saved configuration before returning any partial projection.
      if (!active.currentStageConfig || !active.currentSeriesConfig)
        throw new Error('The saved competition configuration cannot be reconstructed');
      this.state = { ...(await this.describe(active, null)), status: 'ERROR' };
      this.unreadableSavedRun = false;
      if (joined && joined !== active.id)
        throw new Error(
          'Director membership names a different competition. Connect MQTT to clear the mismatched membership, then Retry.',
        );
      const session = await sessions.findById(active.sessionId);
      if (!session) throw new Error(`Saved session ${active.sessionId} is missing`);
      const safetyOwner = this.deps.safetyCompetitionId();
      if (this.deps.safetyStopped() && safetyOwner && safetyOwner !== active.id)
        throw new Error('The safety timer snapshot belongs to a different competition');
      // Validate the saved mode and interruption before opening target intake.
      const interruption = interruptions.get(active.id);
      if (interruption && interruption.competitionId !== active.id)
        throw new Error('The saved interruption belongs to a different competition');
      resolveCompetitionTargetMode(active, session.allShots, interruption);
      const clock = timer.savedClock(active);
      const timedSeries = !!active.currentSeriesConfig.timedTargetProgramId;
      const clockEligible = active.canUpdateTimer() && active.timer.totalSeconds > 0 && !active.timer.isExpired;
      const stageComplete =
        active.phase === 'SERIES_COMPLETE' && active.currentSeriesIndex + 1 >= active.currentStageConfig.series.length;
      const officialPause =
        !interruption?.restartHold && (interruption?.status === 'PAUSED' || interruption?.status === 'RESUME_PENDING');
      if (this.deps.safetyStopped() || this.deps.transferPending()) {
        timer.stop();
      } else if (joined && stageComplete && !officialPause) {
        if (interruption?.restartHold) interruptions.clear(active.id);
        timer.stop();
      } else if (joined && !timedSeries && active.canUpdateTimer() && (clockEligible || interruption)) {
        const remaining = clock
          ? Math.max(0, Math.ceil((clock.expiresAtMs - Date.now()) / 1000))
          : active.timer.remainingSeconds;
        await interruptions.holdAfterRestart(active, remaining, clock !== null);
      } else if (interruption?.status === 'PAUSED' || interruption?.status === 'RESUME_PENDING') {
        // Membership loss leaves a stopped standalone run, never a local resume grant.
        timer.stop();
      } else if (clockEligible && !timedSeries && !joined) {
        if (!clock)
          throw new Error('The running standalone clock has no saved deadline. Finish the saved run to start again.');
        clockToRestore = clock;
      }
      this.deps.restoreIndependentWorkflows();
      if (timedSeries) interruptions.restoreTimedPause(active.id);
      await this.deps.context.bootstrap(sessions, competitions, interruptions);
      this.state = await this.describe((await competitions.findById(active.id))!, null);
      // All reconstruction has completed before any standalone clock can run.
      if (clockToRestore) {
        clockArmed = true;
        await timer.restore(clockToRestore);
      }
    } catch (error) {
      if (clockArmed) timer.stop();
      this.deps.stopIndependentWorkflows();
      this.unknownCompetitionType = (error as { code?: string }).code === 'UNKNOWN_COMPETITION_TYPE';
      // Do not remove a recoverable deadline merely because membership/configuration needs repair.
      this.state = {
        ...this.state,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
        canFinish: !this.unreadableSavedRun && this.canFinish(),
        canSetAside: this.unreadableSavedRun && this.recoveryAllowed(),
        canChooseType: this.unknownCompetitionType && this.recoveryAllowed(),
      };
    }
    return this.state;
  }
}
