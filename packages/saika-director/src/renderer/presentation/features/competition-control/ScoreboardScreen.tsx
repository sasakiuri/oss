import { useEffect } from 'react';
import { useLaneControl } from '../../hooks/useLaneControl';
import { Header } from '../shared/layout/Header';
import { ScoreboardGrid } from '../shared/layout/ScoreboardGrid';
import { Button } from '../shared/common/Button';

export function ScoreboardScreen() {
  const { lanes, loadState, startSeries, selectedIds } = useLaneControl();

  useEffect(() => {
    loadState();
  }, [loadState]);

  const hasPreparationLanes = lanes.some(
    (lane) => lane.phase === 'ACTIVE' && lane.stageIndex === 0 && selectedIds.has(lane.id),
  );

  const handleStartMatch = async () => {
    if (selectedIds.size > 0) {
      await startSeries(Array.from(selectedIds));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header />

      {hasPreparationLanes && (
        <div className="flex justify-center py-2 bg-vscode-bg-light border-b border-vscode-border">
          <Button size="sm" onClick={handleStartMatch}>
            Match
          </Button>
        </div>
      )}

      <ScoreboardGrid />
    </div>
  );
}
