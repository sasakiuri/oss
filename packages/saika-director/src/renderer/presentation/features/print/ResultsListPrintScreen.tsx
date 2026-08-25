import { useEffect, useState, useCallback } from 'react';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import type { RankedResultDto, FinalRankedResultDto } from '@/shared/ipc/contracts/results.contract';
import { ResultsListSheet } from './components/ResultsListSheet';
import { FinalResultSheet, type FinalResultData } from './components/FinalResultSheet';
import { resultsService } from '@/renderer/services';

interface Props {
  config: BoardWindowConfig;
}

function toFinalResultData(results: FinalRankedResultDto[]): FinalResultData[] {
  return results.map((r) => ({
    rank: r.rank,
    firingPointNumber: r.firingPointNumber,
    playerName: r.playerName,
    affiliation: r.affiliation,
    stage1Shots: r.stage1Shots,
    stage1Total: r.stage1Total,
    stage2Shots: r.stage2Shots,
    stage2Total: r.stage2Total,
    totalScore: r.totalScore,
    eliminatedAtShot: r.eliminatedAtShot,
    remarks: r.remarks,
  }));
}

export function ResultsListPrintScreen({ config }: Props) {
  const [qualificationResults, setQualificationResults] = useState<RankedResultDto[]>([]);
  const [finalResults, setFinalResults] = useState<FinalRankedResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const eventId = config.eventId;
  const eventName = config.eventName ?? 'Results List';
  const relayNumber = config.relayNumber;
  const round = config.round ?? 'Qualification';
  const eventType = config.eventType ?? '';

  const isFinal = round === 'Final';

  useEffect(() => {
    if (!eventId) {
      setError('No event was specified');
      setLoading(false);
      return;
    }

    const fetchResults = async () => {
      try {
        if (isFinal) {
          const response = await resultsService.getFinalByEvent({ eventId });
          if (!response.success) throw new Error(response.error?.message ?? 'Failed to retrieve results');
          setFinalResults(response.data.results);
        } else {
          if (relayNumber !== undefined) {
            const response = await resultsService.getByRelay({ eventId, relayNumber });
            if (!response.success) throw new Error(response.error?.message ?? 'Failed to retrieve results');
            setQualificationResults(response.data.results);
          } else {
            const response = await resultsService.getByEvent({ eventId });
            if (!response.success) throw new Error(response.error?.message ?? 'Failed to retrieve results');
            setQualificationResults(response.data.results);
          }
        }
        setLoading(false);
      } catch (err) {
        setError((err as Error)?.message || 'Failed to retrieve results');
        setLoading(false);
      }
    };

    fetchResults();
  }, [eventId, relayNumber, isFinal]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500 text-lg">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-red-500 text-lg mb-4">{error}</div>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const hasResults = isFinal ? finalResults.length > 0 : qualificationResults.length > 0;

  if (!hasResults) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <div className="text-gray-500 text-lg mb-4">No result data</div>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const formattedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Print
        </button>
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
        >
          Close
        </button>
      </div>
      {isFinal ? (
        <FinalResultSheet
          championship={{
            name: config.championshipName || '',
            date: formattedDate,
            venue: config.venue || '',
          }}
          event={{
            name: eventName,
            eventType,
          }}
          results={toFinalResultData(finalResults)}
        />
      ) : (
        <ResultsListSheet eventName={eventName} relayNumber={relayNumber} results={qualificationResults} />
      )}
    </div>
  );
}
