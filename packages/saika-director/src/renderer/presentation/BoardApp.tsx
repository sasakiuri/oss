import { useState, useEffect } from 'react';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import { ElectronEventBus } from '@/renderer/events/ElectronEventBus';
import { EventBusProvider } from '@/renderer/events/EventBusProvider';
import { TargetBoardScreen } from './features/boards/TargetBoardScreen';
import { RankingBoardScreen } from './features/boards/RankingBoardScreen';
import { ResultsBoardScreen } from './features/boards/ResultsBoardScreen';
import { FinalBoardScreen } from './features/boards/FinalBoardScreen';
import { ScoreSheetPrintScreen } from './features/print/ScoreSheetPrintScreen';
import { ResultsListPrintScreen } from './features/print/ResultsListPrintScreen';
import { IncidentReportPrintScreen } from './features/print/IncidentReportPrintScreen';
import { ErrorBoundary } from './features/shared/common';
import { boardService } from '@/renderer/services';

function BoardAppContent() {
  const [config, setConfig] = useState<BoardWindowConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    boardService
      .getConfig()
      .then((response) => {
        if (!response.success) throw new Error(response.error.message);
        setConfig(response.data as BoardWindowConfig | null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-vscode-bg flex items-center justify-center">
        <div className="text-vscode-dimmed text-lg">Loading...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="min-h-screen bg-vscode-bg flex flex-col items-center justify-center">
        <div className="text-red-400 text-lg mb-2">Error</div>
        <div className="text-vscode-dimmed text-base">{error || 'Board configuration was not found'}</div>
      </div>
    );
  }

  switch (config.type) {
    case 'target-board':
      return <TargetBoardScreen config={config} />;
    case 'ranking-board':
      return <RankingBoardScreen />;
    case 'results-board':
      return <ResultsBoardScreen config={config} />;
    case 'final-board':
      return <FinalBoardScreen />;
    case 'score-sheet-print':
      return <ScoreSheetPrintScreen config={config} />;
    case 'results-list-print':
      return <ResultsListPrintScreen config={config} />;
    case 'incident-report-print':
      return <IncidentReportPrintScreen config={config} />;
    default:
      return (
        <div className="min-h-screen bg-vscode-bg flex items-center justify-center">
          <div className="text-vscode-dimmed">Unknown board type: {config.type}</div>
        </div>
      );
  }
}

function BoardApp() {
  const [eventBus] = useState(() => new ElectronEventBus());

  return (
    <EventBusProvider bus={eventBus}>
      <ErrorBoundary>
        <BoardAppContent />
      </ErrorBoundary>
    </EventBusProvider>
  );
}

export default BoardApp;
