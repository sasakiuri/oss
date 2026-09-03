import { useCallback, useMemo, useEffect, useState } from 'react';
import { FinalBoardTable } from './components/FinalBoardTable';
import { laneControlService } from '@/renderer/services';
import { mapResponseToFinalBoardLaneData } from '@/renderer/services/mappers/laneControlMapper';
import { useBoardLaneData } from '@/renderer/presentation/hooks/useBoardLaneData';
import { useAuthoritativeRangeClock } from '@/renderer/presentation/hooks/useAuthoritativeRangeClock';
import type { BoardWindowConfig } from '@/shared/types/BoardWindowConfig';
import type { FinalBoardLaneData, ShootoffState } from './types';
import { RangeClockDisplay } from './components/RangeClockDisplay';

const FINAL_BOARD_PATCH_FIELDS = [
  'unifiedPhase',
  'stageIndex',
  'seriesIndex',
  'eliminated',
  'totalScore',
  'stage1Total',
  'stage2Total',
  'shotNumber',
  'lastScore',
  'stageName',
  'eliminationRank',
];

export function FinalBoardScreen({ config }: { config?: BoardWindowConfig }) {
  const [shootoff, setShootoff] = useState<ShootoffState | null>(null);
  const rangeClock = useAuthoritativeRangeClock(config?.competitionId);

  const loadFn = useCallback(async (): Promise<FinalBoardLaneData[]> => {
    const response = await laneControlService.getAll();
    if (response.success && Array.isArray(response.data)) {
      return (response.data as Array<Record<string, unknown>>)
        .filter((lane) => lane.roundType === 'Final')
        .map(mapResponseToFinalBoardLaneData)
        .filter((lane) => lane.unifiedPhase !== 'IDLE' || lane.playerName !== 'Unregistered');
    }
    return [];
  }, []);

  const {
    data: laneControls,
    loading,
    setData,
  } = useBoardLaneData<FinalBoardLaneData>({
    loadFn,
    filterPatchFields: FINAL_BOARD_PATCH_FIELDS,
    onTimerTick: (data) => {
      setData((prev) =>
        prev.map((lane) => (lane.id === data.laneId ? { ...lane, remainingTime: data.remainingTime } : lane)),
      );
    },
    onTimerExpired: (data) => {
      setData((prev) => prev.map((lane) => (lane.id === data.laneId ? { ...lane, remainingTime: 0 } : lane)));
    },
  });

  const currentStageName = useMemo(() => {
    const activeLanes = laneControls.filter((lc) => !lc.eliminated);
    if (activeLanes.length === 0) return 'Finished';
    const firstLane = activeLanes[0];
    if (!firstLane) return 'Idle';
    if (firstLane.unifiedPhase === 'IDLE') return 'Idle';
    if (firstLane.unifiedPhase === 'FINISHED') return 'Finished';
    return firstLane.stageName || firstLane.unifiedPhase;
  }, [laneControls]);

  useEffect(() => {
    const activeLanes = laneControls.filter((lc) => !lc.eliminated);
    const shootoffLanes = activeLanes.filter((lc) => lc.unifiedPhase === 'SHOOTOFF');

    if (shootoffLanes.length > 0) {
      setShootoff({
        targetLaneIds: shootoffLanes.map((lc) => lc.id),
        currentRound: Math.max(...shootoffLanes.map((lc) => lc.shootoffShots.length), 1),
      });
    } else {
      setShootoff(null);
    }
  }, [laneControls]);

  const remainingPlayersCount = laneControls.filter((lc) => !lc.eliminated).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-900">
        <div className="text-zinc-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (laneControls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900">
        <div className="text-zinc-400 text-xl mb-2">No Final Lane data</div>
        <div className="text-zinc-500 text-base">Data will appear after the Final round starts</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-zinc-900 p-4 flex flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-zinc-100">Final Scoreboard</h1>
          <StageIndicator stageName={currentStageName} />
        </div>
        <div className="flex items-center gap-6">
          <RangeClockDisplay clock={rangeClock} />
          <span className="text-zinc-400 text-lg">{remainingPlayersCount} athletes remaining</span>
        </div>
      </div>

      {shootoff && (
        <div className="mb-2 px-4 py-2 bg-yellow-900/40 border border-yellow-500 rounded-lg flex items-center justify-between">
          <span className="text-yellow-300 font-semibold">Shootoff in progress - Round {shootoff.currentRound}</span>
          <span className="text-yellow-200">Targets: {shootoff.targetLaneIds.length}</span>
        </div>
      )}

      {/* Final Board Table */}
      <div className="flex-1 overflow-auto">
        <FinalBoardTable
          laneControls={laneControls}
          currentStageName={currentStageName}
          shootoff={shootoff ?? undefined}
        />
      </div>
    </div>
  );
}

function StageIndicator({ stageName }: { stageName: string }) {
  const stageColorMap: Record<string, string> = {
    Idle: 'bg-zinc-700 text-zinc-400',
    Preparation: 'bg-yellow-900/60 text-yellow-300',
    '1st Competition Stage': 'bg-blue-900/60 text-blue-300',
    '2nd Competition Stage': 'bg-green-900/60 text-green-300',
    Shootoff: 'bg-orange-900/60 text-orange-300',
    Finished: 'bg-purple-900/60 text-purple-300',
    IDLE: 'bg-zinc-700 text-zinc-400',
    ACTIVE: 'bg-green-900/60 text-green-300',
    SHOT_COMPLETE: 'bg-yellow-900/60 text-yellow-300',
    SERIES_COMPLETE: 'bg-yellow-900/60 text-yellow-300',
    STAGE_ENTERED: 'bg-blue-900/60 text-blue-300',
    SHOOTOFF: 'bg-orange-900/60 text-orange-300',
    FINISHED: 'bg-purple-900/60 text-purple-300',
  };

  const colorClass = stageColorMap[stageName] ?? 'bg-zinc-700 text-zinc-400';

  return <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colorClass}`}>{stageName}</span>;
}
