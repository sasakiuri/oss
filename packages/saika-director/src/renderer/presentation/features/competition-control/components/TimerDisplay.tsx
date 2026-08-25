import { Clock } from 'lucide-react';
import { useTimer } from '../../../hooks/useTimer';

export function TimerDisplay() {
  const { formatted, isRunning, remainingTime } = useTimer();
  const isLow = remainingTime > 0 && remainingTime <= 60; // last minute warning

  if (!isRunning && remainingTime === 0) return null;

  return (
    <div className={`flex items-center gap-1.5 font-mono text-base ${
      isLow ? 'text-vscode-error animate-pulse' : 'text-vscode-text'
    }`}>
      <Clock size={14} />
      <span>{formatted}</span>
    </div>
  );
}
