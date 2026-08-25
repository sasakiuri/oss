import { memo } from 'react';

interface ShotScoreProps {
  shotNumber: number;
  score?: number;
}

export const ShotScore = memo(function ShotScore({ shotNumber, score }: ShotScoreProps) {
  const scoreText = score !== undefined ? score.toFixed(1) : '-';
  const isHighScore = score !== undefined && score >= 10.0;

  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-vscode-text-muted">{shotNumber}</span>
      <span className={`text-base font-mono ${
        score === undefined ? 'text-vscode-text-muted'
        : isHighScore ? 'text-vscode-success font-bold'
        : 'text-vscode-text'
      }`}>
        {scoreText}
      </span>
    </div>
  );
});
