import { useEffect, useState, useCallback } from 'react';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import type { ScoreSheetDto } from '@/shared/ipc/contracts/laneControl.contract';
import { ScoreSheet } from './components/ScoreSheet';
import { FinalResultSheet, type FinalResultData } from './components/FinalResultSheet';
import { laneControlService } from '@/renderer/services';
import { calculateCurrentRanks } from '../shared/scoring';

interface Props {
  config: BoardWindowConfig;
}

function toFinalResultData(lanes: Array<Record<string, unknown>>, laneIds: string[]): FinalResultData[] {
  const filteredLanes = lanes.filter((lane) => laneIds.includes(lane.id as string));

  const laneData = filteredLanes.map((lane) => {
    const player = lane.player as { name: string; affiliation: string } | null;
    const matchShots = (lane.matchShots as number[]) ?? [];
    return {
      id: lane.id as string,
      channel: lane.channel as number,
      playerName: player?.name ?? 'Unregistered',
      affiliation: player?.affiliation ?? '-',
      stage1Shots: matchShots.slice(0, 10),
      stage2Shots: matchShots.slice(10),
      stage1Total: (lane.stage1Total as number) ?? 0,
      stage2Total: (lane.stage2Total as number) ?? 0,
      totalScore: (lane.totalScore as number) ?? 0,
      eliminated: (lane.eliminated as boolean) ?? false,
      eliminationRank: (lane.eliminationRank as number | null) ?? null,
    };
  });

  const ranks = calculateCurrentRanks(laneData);

  return laneData.map((lane) => ({
    rank: ranks.get(lane.id) ?? 99,
    firingPointNumber: lane.channel,
    playerName: lane.playerName,
    affiliation: lane.affiliation,
    stage1Shots: lane.stage1Shots,
    stage1Total: lane.stage1Total,
    stage2Shots: lane.stage2Shots,
    stage2Total: lane.stage2Total,
    totalScore: lane.totalScore,
    eliminatedAtShot: lane.eliminated ? 10 + lane.stage2Shots.length : undefined,
    remarks: lane.eliminated ? `E${10 + lane.stage2Shots.length}` : '',
  }));
}

export function ScoreSheetPrintScreen({ config }: Props) {
  const [scoreSheets, setScoreSheets] = useState<ScoreSheetDto[]>([]);
  const [finalResults, setFinalResults] = useState<FinalResultData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const laneIds = config.laneIds ?? [];

  useEffect(() => {
    if (laneIds.length === 0) {
      setError('No Lanes were selected for printing');
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const qualResponse = await laneControlService.getScoreSheets({ laneIds });
        if (qualResponse.success && qualResponse.data.scoreSheets.length > 0) {
          const sheetsWithContext = qualResponse.data.scoreSheets.map((sheet: ScoreSheetDto) => ({
            ...sheet,
            championshipName: config.championshipName,
            venue: config.venue,
            eventName: config.eventName,
          }));
          setScoreSheets(sheetsWithContext);
          setLoading(false);
          return;
        }

        const unifiedResponse = await laneControlService.getAll();
        if (unifiedResponse.success && Array.isArray(unifiedResponse.data)) {
          const results = toFinalResultData(unifiedResponse.data as Array<Record<string, unknown>>, laneIds);
          if (results.length > 0) {
            setFinalResults(results);
            setLoading(false);
            return;
          }
        }

        setError('No printable data was found');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to retrieve score sheets');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [laneIds, config.championshipName, config.venue, config.eventName]);

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
      {finalResults ? (
        <FinalResultSheet
          championship={{
            name: config.championshipName ?? '',
            date: new Date().toLocaleDateString('en-US'),
            venue: config.venue ?? '',
          }}
          event={{
            name: config.eventName ?? '',
            eventType: config.eventType ?? '',
          }}
          results={finalResults}
        />
      ) : (
        scoreSheets.map((sheet) => <ScoreSheet key={sheet.laneId} data={sheet} />)
      )}
    </div>
  );
}
