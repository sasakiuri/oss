import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';

import type {
  ActivateLaneSafetyStopInput,
  ClearLaneSafetyStopInput,
  ILaneSafetyStopControl,
  ISafetyTimerFreezer,
} from '../domain/ILaneSafetyStopControl';
import type { ILaneSafetyStopRepository } from '../domain/ILaneSafetyStopRepository';
import { LaneSafetyStopState } from '../domain/LaneSafetyStopState';

/**
 * Fail-safe, competition-independent safety latch.
 *
 * STOP is persisted and emitted before the timer freezer is invoked. Therefore
 * a timer/storage failure cannot silently reopen shot ingestion.
 */
export class LaneSafetyStopService implements ILaneSafetyStopControl {
  private state: LaneSafetyStopState | null;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: ILaneSafetyStopRepository,
    private readonly timerFreezer: ISafetyTimerFreezer,
    private readonly eventBus: IEventBus,
  ) {
    this.state = repository.getCurrent();
  }

  activate(input: ActivateLaneSafetyStopInput): Promise<LaneSafetyStopState> {
    return this.serialize(() => this.activateNow(input));
  }

  clear(input: ClearLaneSafetyStopInput): Promise<LaneSafetyStopState> {
    return this.serialize(() => this.clearNow(input));
  }

  getState(): LaneSafetyStopState | null {
    return this.state;
  }

  isStopped(): boolean {
    return this.state?.status === 'STOPPED';
  }

  private async activateNow(input: ActivateLaneSafetyStopInput): Promise<LaneSafetyStopState> {
    if (this.state?.status === 'STOPPED') {
      if (this.state.safetyStopId === input.safetyStopId) {
        if (this.state.timerSnapshot) return this.state;
        const retrySnapshot = await this.timerFreezer.freeze();
        if (!retrySnapshot) return this.state;
        this.repository.appendTimerFrozen(this.state.safetyStopId, retrySnapshot);
        const retried = this.state.withTimerSnapshot(retrySnapshot);
        this.state = retried;
        this.emit(retried);
        return retried;
      }
      throw new Error(`Safety stop ${this.state.safetyStopId} is already active`);
    }

    const stopped = LaneSafetyStopState.create({
      safetyStopId: input.safetyStopId,
      status: 'STOPPED',
      reason: input.reason,
      stoppedBy: input.issuedBy,
      stoppedAt: input.issuedAt,
    });

    // Persist the latch first. Timer capture is an enhancement to a STOP, not
    // a prerequisite for preventing firing and shot placement.
    this.repository.appendStopped(stopped);
    this.state = stopped;
    this.emit(stopped);

    const snapshot = await this.timerFreezer.freeze();
    if (!snapshot) return stopped;

    this.repository.appendTimerFrozen(stopped.safetyStopId, snapshot);
    const frozen = stopped.withTimerSnapshot(snapshot);
    this.state = frozen;
    this.emit(frozen);
    return frozen;
  }

  private async clearNow(input: ClearLaneSafetyStopInput): Promise<LaneSafetyStopState> {
    if (input.confirmedSafe !== true) throw new Error('Explicit range-safe confirmation is required');
    const current = this.state;
    if (!current) throw new Error('No safety stop is recorded');
    if (current.safetyStopId !== input.safetyStopId) {
      throw new Error(`Safety stop ${input.safetyStopId} does not match active stop ${current.safetyStopId}`);
    }
    if (current.status === 'CLEAR') return current;

    const cleared = current.clear({
      clearedBy: input.clearedBy,
      clearanceReason: input.clearanceReason,
      clearedAt: input.clearedAt,
    });
    this.repository.appendCleared(cleared);
    this.state = cleared;
    this.emit(cleared);
    // Clearing the safety latch intentionally does not restart a competition
    // timer. Any restart remains an independent Director operation.
    return cleared;
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private emit(state: LaneSafetyStopState): void {
    this.eventBus.emit({
      type: 'SafetyStopChanged',
      timestamp: Date.now(),
      aggregateId: state.safetyStopId,
      safetyStopId: state.safetyStopId,
      status: state.status,
      reason: state.reason,
      stoppedBy: state.stoppedBy,
      stoppedAt: state.stoppedAt.getTime(),
      competitionId: state.timerSnapshot?.competitionId ?? null,
      remainingSeconds: state.timerSnapshot?.remainingSeconds ?? null,
      totalSeconds: state.timerSnapshot?.totalSeconds ?? null,
      frozenAt: state.timerSnapshot?.frozenAt.getTime() ?? null,
      clearedBy: state.clearedBy,
      clearanceReason: state.clearanceReason,
      clearedAt: state.clearedAt?.getTime() ?? null,
    });
  }
}
