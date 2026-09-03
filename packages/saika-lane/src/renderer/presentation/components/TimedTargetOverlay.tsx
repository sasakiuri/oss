import { useEffect, useMemo, useState } from 'react';

import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { timedTargetService } from '@/renderer/services/timedTargetService';
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

export function TimedTargetOverlay() {
  const [state, setState] = useState<TimedTargetStateDto | null>(null);
  const [now, setNow] = useState(Date.now());
  const [cancelError, setCancelError] = useState<string | null>(null);
  const setTargetProfileId = useCompetitionStore((store) => store.setTargetProfileId);

  useEffect(() => {
    let mounted = true;
    const applyState = (next: TimedTargetStateDto | null): void => {
      setState(next);
      if (next && isTargetScoringProfileId(next.targetProfileId)) setTargetProfileId(next.targetProfileId);
    };
    void timedTargetService
      .getState()
      .then((current) => {
        if (mounted) applyState(current);
      })
      .catch(() => undefined);
    const unsubscribe = window.electronAPI.on.timedTargetSequenceChanged((next) => {
      applyState(next);
      setCancelError(null);
    });
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

  if (!state || !ACTIVE_PHASES.has(state.phase)) return null;
  const firing = state.phase === 'FIRING';
  const tone = firing
    ? 'border-emerald-200 bg-emerald-700 text-white'
    : state.phase === 'LOAD'
      ? 'border-sky-200 bg-sky-950/95 text-white'
      : 'border-red-200 bg-red-950/95 text-white';
  const instruction = {
    ARMED: 'Stand by for LOAD',
    LOAD: 'LOAD',
    ATTENTION: 'ATTENTION',
    FIRING: 'GREEN — FIRE',
    AFTER_TIME: 'RED — recording after-time',
    BETWEEN_EXPOSURES: 'RED — await next exposure',
    COMPLETE: '',
    CANCELLED: '',
  }[state.phase];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-50 flex justify-center px-6"
      role={firing ? 'status' : 'alert'}
      aria-live="assertive"
      data-testid="timed-target-overlay"
    >
      <div className={`min-w-[36rem] rounded-xl border-4 px-10 py-5 text-center shadow-2xl ${tone}`}>
        <div className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">
          {state.programLabel} · {state.purpose}
        </div>
        <div className="mt-1 text-5xl font-black tracking-wider">{instruction}</div>
        <div className="mt-2 font-mono text-xl font-bold">
          {remaining === null ? '--' : `${(remaining / 1_000).toFixed(1)} s`}
          {state.exposureIndex === null ? '' : ` · exposure ${state.exposureIndex + 1}/${state.exposureCount}`}
        </div>
        <div className="mt-1 text-xs opacity-80">ISSF {state.ruleReference}</div>
        <button
          type="button"
          className="pointer-events-auto mt-3 rounded border border-white/70 px-4 py-1 text-sm font-bold hover:bg-white/15"
          onClick={() => {
            setCancelError(null);
            void timedTargetService
              .cancel({ sequenceId: state.sequenceId, reason: 'Emergency local cancellation' })
              .catch((error: unknown) => setCancelError(error instanceof Error ? error.message : String(error)));
          }}
        >
          Cancel sequence
        </button>
        {cancelError && <div className="mt-2 text-sm font-semibold text-amber-200">{cancelError}</div>}
      </div>
    </div>
  );
}
