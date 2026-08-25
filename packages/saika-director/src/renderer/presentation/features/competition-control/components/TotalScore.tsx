import { memo } from 'react';

interface TotalScoreProps {
  total: number;
  shotCount: number;
}

export const TotalScore = memo(function TotalScore({ total, shotCount }: TotalScoreProps) {
  return (
    <div className="flex items-center justify-between pt-1 border-t border-vscode-border">
      <span className="text-base text-vscode-text-muted">{shotCount}/60 shots</span>
      <span className="text-lg font-bold font-mono text-vscode-text">{total.toFixed(1)}</span>
    </div>
  );
});
