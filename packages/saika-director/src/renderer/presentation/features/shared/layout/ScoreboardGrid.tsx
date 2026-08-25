import { useLaneControl } from '../../../hooks/useLaneControl';
import { LaneCard } from '../common/LaneCard';

export function ScoreboardGrid() {
  const { lanes } = useLaneControl();

  if (lanes.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-vscode-text-muted">No Lanes are connected</div>;
  }

  // Grid columns based on lane count
  const gridCols =
    lanes.length <= 3
      ? 'grid-cols-1 md:grid-cols-3'
      : lanes.length <= 6
        ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-3'
        : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';

  return (
    <div className={`flex-1 grid ${gridCols} gap-3 p-4 overflow-y-auto`}>
      {lanes.map((lane) => (
        <LaneCard key={lane.id} lane={lane} />
      ))}
    </div>
  );
}
