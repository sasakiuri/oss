import { useCallback } from 'react';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import type { LaneControlDto } from '../../stores/domain/laneControl.store';
import { TargetBoardCard } from './components/TargetBoardCard';
import { laneControlService } from '@/renderer/services';
import { mapResponseToLaneControlDto } from '@/renderer/services/mappers/laneControlMapper';
import { useBoardLaneData } from '@/renderer/presentation/hooks/useBoardLaneData';

interface Props {
  config: BoardWindowConfig;
}

export function TargetBoardScreen({ config }: Props) {
  const laneRange = config.laneRange ?? { from: 1, to: 6 };

  const loadFn = useCallback(async (): Promise<LaneControlDto[]> => {
    const response = await laneControlService.getAll();
    if (response.success && Array.isArray(response.data)) {
      return (response.data as Array<Record<string, unknown>>).map(mapResponseToLaneControlDto);
    }
    return [];
  }, []);

  const {
    data: lanes,
    loading,
    setData,
  } = useBoardLaneData<LaneControlDto>({
    loadFn,
    onTimerTick: (data) => {
      setData((prev) =>
        prev.map((l) =>
          l.id === data.laneId
            ? { ...l, remainingTime: data.remainingTime, phase: data.phase as LaneControlDto['phase'] }
            : l,
        ),
      );
    },
  });

  const filteredLanes = lanes.filter((lane) => lane.channel >= laneRange.from && lane.channel <= laneRange.to);

  const sortedLanes = [...filteredLanes].sort((a, b) => a.channel - b.channel);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-900">
        <div className="text-zinc-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (sortedLanes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900">
        <div className="text-zinc-400 text-xl mb-2">No Lane data</div>
        <div className="text-zinc-500 text-base">
          Showing Lanes {laneRange.from} - {laneRange.to}
        </div>
      </div>
    );
  }

  const displayLanes = sortedLanes.slice(0, 8);

  return (
    <div className="h-screen bg-zinc-900 p-4 flex flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-bold text-zinc-100">Target Board</h1>
        <span className="text-zinc-400 text-lg">
          Lanes {laneRange.from} - {laneRange.to}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-4 grid-rows-2 gap-3">
        {Array.from({ length: 8 }, (_, i) => {
          const lane = displayLanes[i];
          if (lane) {
            return (
              <TargetBoardCard
                key={lane.id}
                channel={lane.channel}
                playerName={lane.playerName}
                affiliation={lane.affiliation}
                totalScore={lane.totalScore}
                seriesScores={lane.seriesScores}
                shotCount={lane.shotNumber}
                recentShots={lane.recentShots}
                phase={lane.phase}
              />
            );
          }
          return (
            <div key={`empty-${i}`} className="bg-zinc-800/30 border-2 border-dashed border-zinc-700 rounded-lg" />
          );
        })}
      </div>
    </div>
  );
}
