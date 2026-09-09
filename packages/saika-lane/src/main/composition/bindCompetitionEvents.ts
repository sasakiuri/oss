// SPDX-License-Identifier: MIT
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import { type IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/** Coordinates competition events without coupling the participating feature modules. */
export function bindCompetitionEvents(
  eventBus: IEventBus,
  timedTargetControl: Pick<ITimedTargetControl, 'getState' | 'cancel'>,
): () => void {
  const subscriptions: (() => void)[] = [];
  const cancelActiveTimedTarget = (reason: string, competitionId?: string | null): void => {
    const state = timedTargetControl.getState(competitionId ?? undefined);
    if (!state || state.phase === 'COMPLETE' || state.phase === 'CANCELLED') return;
    timedTargetControl.cancel({ sequenceId: state.sequenceId, reason });
  };
  subscriptions.push(
    eventBus.on('SafetyStopChanged', (event) => {
      if (event.status === 'STOPPED') cancelActiveTimedTarget(`Safety stop ${event.safetyStopId}: ${event.reason}`);
    }),
  );
  subscriptions.push(
    eventBus.on('CompetitionInterruptionChanged', (event) => {
      if (event.status === 'PAUSED') {
        cancelActiveTimedTarget(`Competition interruption ${event.interruptionId}`, event.aggregateId);
      }
    }),
  );
  subscriptions.push(
    eventBus.on('CompetitionFinished', (event) => {
      cancelActiveTimedTarget('Competition finished', event.aggregateId);
    }),
  );

  return () => subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
}
