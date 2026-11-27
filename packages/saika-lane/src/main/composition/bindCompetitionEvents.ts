// SPDX-License-Identifier: MIT
import { cancelActiveTimedTarget, type ITimedTargetControl } from '@/main/modules/timed-target';
import { type IEventBus } from '@/main/shared-infra/events/TypedEventBus';

/** Coordinates competition events without coupling the participating feature modules. */
export function bindCompetitionEvents(
  eventBus: IEventBus,
  timedTargetControl: Pick<ITimedTargetControl, 'getState' | 'cancel'>,
): () => void {
  const subscriptions: (() => void)[] = [];
  subscriptions.push(
    eventBus.on('CompetitionInterruptionChanged', (event) => {
      if (event.status === 'PAUSED') {
        cancelActiveTimedTarget(
          timedTargetControl,
          `Competition interruption ${event.interruptionId}`,
          event.aggregateId,
        );
      }
    }),
  );
  subscriptions.push(
    eventBus.on('CompetitionFinished', (event) => {
      cancelActiveTimedTarget(timedTargetControl, 'Competition finished', event.aggregateId);
    }),
  );

  return () => subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
}
