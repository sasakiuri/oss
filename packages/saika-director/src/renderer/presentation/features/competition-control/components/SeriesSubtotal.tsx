interface SeriesSubtotalProps {
  seriesScores: number[];
}

export function SeriesSubtotal({ seriesScores }: SeriesSubtotalProps) {
  return (
    <div className="flex items-center gap-2 pt-1 border-t border-vscode-border/50">
      {seriesScores.map((score, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <span className="text-[9px] text-vscode-text-muted">S{idx + 1}</span>
          <span className="text-base font-mono text-vscode-text">{score.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}
