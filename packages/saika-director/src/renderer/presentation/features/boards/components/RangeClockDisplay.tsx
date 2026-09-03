import type { RangeClockProjection } from '../rangeClock';

interface Props {
  clock: RangeClockProjection;
  compact?: boolean;
}

export function RangeClockDisplay({ clock, compact = false }: Props) {
  const wallClock = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(clock.observedAtMs));
  const countdown = clock.remainingSeconds === null ? '--:--' : formatDuration(clock.remainingSeconds);
  const critical = clock.remainingSeconds !== null && clock.remainingSeconds <= 10;
  const warning = clock.remainingSeconds !== null && clock.remainingSeconds <= 30;
  const countdownColor = critical ? 'text-red-400' : warning ? 'text-yellow-300' : 'text-zinc-100';
  const stateLabel =
    clock.status === 'SCHEDULED'
      ? `START IN ${clock.startsInSeconds ?? 0}s`
      : clock.status === 'RUNNING'
        ? (clock.timerScope ?? 'RUNNING')
        : clock.status;

  return (
    <div
      className={`flex items-center rounded-lg border border-zinc-600 bg-zinc-950/80 ${compact ? 'gap-3 px-3 py-1' : 'gap-5 px-4 py-2'}`}
      aria-label="Director range clock"
      title={`Director competition state · ISSF ${clock.ruleReference}`}
    >
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-semibold tracking-widest text-zinc-400">RANGE CLOCK</span>
        <span className={`font-mono font-bold tabular-nums ${compact ? 'text-lg' : 'text-2xl'} ${countdownColor}`}>
          {countdown}
        </span>
      </div>
      <div className="flex flex-col leading-tight text-right">
        <span className="font-mono text-sm tabular-nums text-zinc-300">{wallClock}</span>
        <span className={`text-[10px] font-semibold ${clock.synchronized ? 'text-green-400' : 'text-orange-400'}`}>
          {clock.synchronized ? stateLabel : `${stateLabel} · MQTT OFFLINE`}
        </span>
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
