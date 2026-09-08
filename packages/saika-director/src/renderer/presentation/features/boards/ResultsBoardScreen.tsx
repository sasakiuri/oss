import { useState } from 'react';

import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';

import { ResultsView } from '../championship/components/ResultsView';
import { Button } from '../shared/common/Button';

import { PublishedResultsSummary } from './PublishedResultsSummary';

interface Props {
  config: BoardWindowConfig;
}

export function ResultsBoardScreen({ config }: Props) {
  const { eventId, eventName, round } = config;
  const [details, setDetails] = useState(false);

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
        <h1 className="text-xl font-bold text-vscode-text">{eventName ?? 'Results Board'}</h1>
        <Button size="sm" variant="secondary" onClick={() => setDetails(!details)}>
          {details ? 'Show publication summary' : 'Show detailed results'}
        </Button>
      </div>

      {/* Results View */}
      <div className="flex-1 overflow-auto">
        {details ? (
          <>
            <p className="mb-4 text-vscode-dimmed">
              Detailed results · Use the publication summary to check current publication status.
            </p>
            <ResultsView eventId={eventId} eventName={eventName} round={round} readOnly />
          </>
        ) : (
          <PublishedResultsSummary
            key={`${eventId}:${round}`}
            eventId={eventId}
            resultScope={round === 'Final' ? 'FINAL' : 'QUALIFICATION'}
          />
        )}
      </div>
    </div>
  );
}
