import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import { ResultsView } from '../championship/components/ResultsView';

interface Props {
  config: BoardWindowConfig;
}

export function ResultsBoardScreen({ config }: Props) {
  const { competitionId, eventId, round } = config;

  if (!eventId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-vscode-bg">
        <div className="text-vscode-dimmed text-xl mb-2">No event selected</div>
        <div className="text-vscode-dimmed text-base">Select an event before opening the board</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vscode-bg p-4 flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-vscode-text">Results Board</h1>
        {competitionId && <span className="text-vscode-dimmed text-base">Competition ID: {competitionId}</span>}
      </div>

      {/* Results View */}
      <div className="flex-1 overflow-auto">
        <ResultsView eventId={eventId} round={round} />
      </div>
    </div>
  );
}
