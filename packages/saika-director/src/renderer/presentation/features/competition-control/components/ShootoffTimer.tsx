import { Play, Pause, RotateCcw } from 'lucide-react';

interface ShootoffTimerProps {
  timerSeconds: number;
  timerRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ShootoffTimer({ timerSeconds, timerRunning, onStart, onPause, onReset }: ShootoffTimerProps) {
  return (
    <div className="px-6 py-4 bg-vscode-bg-light border-b border-vscode-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base text-vscode-dimmed">Shot Timer</span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-3xl font-mono font-bold ${timerSeconds <= 10 ? 'text-red-400' : 'text-vscode-text'}`}>
            {formatTime(timerSeconds)}
          </span>
          <div className="flex items-center gap-1">
            {timerRunning ? (
              <button
                onClick={onPause}
                className="p-2 rounded bg-yellow-600 hover:bg-yellow-500 text-white"
                title="Pause"
              >
                <Pause size={16} />
              </button>
            ) : (
              <button
                onClick={onStart}
                className="p-2 rounded bg-green-600 hover:bg-green-500 text-white"
                title="Start"
              >
                <Play size={16} />
              </button>
            )}
            <button
              onClick={onReset}
              className="p-2 rounded bg-vscode-bg-lighter hover:bg-vscode-hover text-vscode-text"
              title="Reset"
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="mt-2 h-2 bg-vscode-border rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-1000 ${timerSeconds <= 10 ? 'bg-red-500' : 'bg-orange-500'}`}
          style={{ width: `${(timerSeconds / 50) * 100}%` }}
        />
      </div>
    </div>
  );
}
