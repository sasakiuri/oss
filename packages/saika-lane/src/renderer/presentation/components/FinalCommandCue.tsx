import { useFinalCueStore } from '@/renderer/presentation/stores/finalCueStore';

export function FinalCommandCue() {
  const cue = useFinalCueStore((state) => state.cue);
  if (!cue) return null;

  const tone = cue.effect.type === 'CLOSE_FIRING' ? 'red' : cue.effect.type === 'OPEN_FIRING' ? 'green' : 'amber';
  const toneClass = {
    red: 'border-red-300 bg-red-950/95 text-white',
    green: 'border-emerald-300 bg-emerald-950/95 text-white',
    amber: 'border-amber-300 bg-zinc-950/95 text-white',
  }[tone];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-12 z-40 flex justify-center px-6"
      role={cue.kind === 'COMMAND' ? 'alert' : 'status'}
      aria-live={cue.kind === 'COMMAND' ? 'assertive' : 'polite'}
      data-testid="final-command-cue"
    >
      <div className={`max-w-5xl rounded-lg border-4 px-10 py-5 text-center shadow-2xl ${toneClass}`}>
        <div className="text-xs font-bold uppercase tracking-[0.24em] opacity-80">
          {cue.actor.replaceAll('_', ' ')} · {cue.branch === 'SHOOT_OFF' ? `Shoot-off ${cue.iteration}` : 'Final'}
        </div>
        <div className="mt-2 text-4xl font-black tracking-wide">{cue.text}</div>
        <div className="mt-2 text-xs opacity-75">ISSF {cue.ruleReference}</div>
      </div>
    </div>
  );
}
