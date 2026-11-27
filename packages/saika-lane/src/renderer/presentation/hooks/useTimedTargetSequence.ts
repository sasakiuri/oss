// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { timedTargetService } from '@/renderer/services/timedTargetService';
import { errorMessage } from '@/shared/errors/errorMessage';
import type { TimedTargetStateDto } from '@/shared/ipc/contracts';
import { isTargetScoringProfileId } from '@/shared/target';

const ACTIVE_PHASES = new Set<TimedTargetStateDto['phase']>([
  'ARMED',
  'LOAD',
  'ATTENTION',
  'FIRING',
  'AFTER_TIME',
  'BETWEEN_EXPOSURES',
]);

/**
 * The running ISSF 25m timed-target sequence (null when none is active), the milliseconds to its next transition
 * and its local emergency cancellation. Reads the state on mount, follows its events and applies the sequence's
 * target profile to the competition store.
 */
export function useTimedTargetSequence() {
  const [state, setState] = useState<TimedTargetStateDto | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cancelError, setCancelError] = useState<string | null>(null);
  const setTargetProfileId = useCompetitionStore((store) => store.setTargetProfileId);

  useEffect(() => {
    let mounted = true;
    let eventGeneration = 0;
    const applyState = (next: TimedTargetStateDto | null): void => {
      setState(next);
      if (next && isTargetScoringProfileId(next.targetProfileId)) setTargetProfileId(next.targetProfileId);
    };
    const unsubscribe = window.electronAPI.on.timedTargetSequenceChanged((next) => {
      eventGeneration += 1;
      applyState(next);
      setCancelError(null);
    });
    const bootstrapGeneration = eventGeneration;
    void timedTargetService
      .getState()
      .then((current) => {
        if (mounted && eventGeneration === bootstrapGeneration) applyState(current);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setTargetProfileId]);

  useEffect(() => {
    if (!state || !ACTIVE_PHASES.has(state.phase)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(timer);
  }, [state]);

  const remaining = useMemo(() => {
    if (!state?.nextTransitionAt) return null;
    return Math.max(0, Date.parse(state.nextTransitionAt) - now);
  }, [now, state]);

  const sequence = state && ACTIVE_PHASES.has(state.phase) ? state : null;

  const cancel = (): void => {
    if (!sequence) return;
    setCancelError(null);
    void timedTargetService
      .cancel({ sequenceId: sequence.sequenceId, reason: 'Emergency local cancellation' })
      .catch((error: unknown) => setCancelError(errorMessage(error)));
  };

  return { sequence, remaining, cancel, cancelError };
}
