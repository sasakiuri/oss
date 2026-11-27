// SPDX-License-Identifier: MIT
import { useTimedTargetSequence } from '@/renderer/presentation/hooks/useTimedTargetSequence';

export function TimedTargetOverlay() {
  const { sequence, remaining, cancel, cancelError } = useTimedTargetSequence();

  if (!sequence) return null;
  const firing = sequence.phase === 'FIRING';
  const tone = firing
    ? 'border-emerald-200 bg-emerald-700 text-white'
    : sequence.phase === 'LOAD'
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
  }[sequence.phase];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-50 flex justify-center px-6"
      role={firing ? 'status' : 'alert'}
      aria-live="assertive"
      data-testid="timed-target-overlay"
    >
      <div className={`min-w-[36rem] rounded-xl border-4 px-10 py-5 text-center shadow-2xl ${tone}`}>
        <div className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">
          {sequence.programLabel} · {sequence.purpose}
        </div>
        <div className="mt-1 text-5xl font-black tracking-wider">{instruction}</div>
        <div className="mt-2 font-mono text-xl font-bold">
          {remaining === null ? '--' : `${(remaining / 1_000).toFixed(1)} s`}
          {sequence.exposureIndex === null ? '' : ` · exposure ${sequence.exposureIndex + 1}/${sequence.exposureCount}`}
        </div>
        <div className="mt-1 text-xs opacity-80">ISSF {sequence.ruleReference}</div>
        <button
          type="button"
          className="pointer-events-auto mt-3 rounded border border-white/70 px-4 py-1 text-sm font-bold hover:bg-white/15"
          onClick={cancel}
        >
          Cancel sequence
        </button>
        {cancelError && <div className="mt-2 text-sm font-semibold text-amber-200">{cancelError}</div>}
      </div>
    </div>
  );
}
