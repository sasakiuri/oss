import { useCallback } from 'react';
import type { LiveRankingDto } from '@/shared/types/LiveRankingDto';
import { RankingTable } from './components/RankingTable';
import { boardService } from '@/renderer/services';
import { useBoardLaneData } from '@/renderer/presentation/hooks/useBoardLaneData';

export function RankingBoardScreen() {
  const loadFn = useCallback(async (): Promise<LiveRankingDto[]> => {
    const response = await boardService.getLiveRanking();
    if (response.success && Array.isArray(response.data)) {
      return response.data as LiveRankingDto[];
    }
    return [];
  }, []);

  const { data: rankings, loading } = useBoardLaneData<LiveRankingDto>({
    loadFn,
  });

  const isCompetitionActive = rankings.some((r) => r.phase !== 'IDLE' && r.phase !== 'FINISHED');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-vscode-bg">
        <div className="text-vscode-dimmed text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-vscode-bg p-4 flex flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-vscode-text">Ranking Board</h1>
        <span className="text-vscode-dimmed text-base">{rankings.length} athletes</span>
      </div>

      {/* Ranking Table */}
      <div className="flex-1 overflow-auto">
        <RankingTable rankings={rankings} showAverage={isCompetitionActive} />
      </div>
    </div>
  );
}
