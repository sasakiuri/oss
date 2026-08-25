import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type { LaneControl } from '../domain/LaneControl';
import type { LanePhase } from '@/shared/constants/competition';

export interface LaneControlDto {
  id: string;
  channel: number;
  player: { name: string; affiliation: string; participantId?: string } | null;
  phase: LanePhase;
  unifiedPhase: LanePhase;
  stageIndex: number;
  seriesIndex: number;
  roundType: string;
  stageName: string;
  timer: { remainingSeconds: number; totalSeconds: number } | null;
  preparationShots: number[];
  matchShots: number[];
  shootoffShots: number[];
  eliminated: boolean;
  eliminationRank: number | null;
  totalScore: number;
  stage1Total: number;
  stage2Total: number;
  seriesScores: number[];
  recentShots: number[];
  shotNumber: number;
  lastScore: number | null;
  lastShotTime: number | null;
  remainingTime: number;
  relayNumber: number;
}

function toDto(lane: LaneControl): LaneControlDto {
  return {
    id: lane.id,
    channel: lane.channel.value,
    player: lane.player
      ? { name: lane.player.name, affiliation: lane.player.affiliation, participantId: lane.player.participantId }
      : null,
    phase: lane.phase,
    unifiedPhase: lane.phase,
    stageIndex: lane.stageIndex,
    seriesIndex: lane.seriesIndex,
    roundType: lane.config.roundType,
    stageName: lane.currentStageName,
    timer: lane.timer ? { remainingSeconds: lane.timer.remainingSeconds, totalSeconds: lane.timer.totalSeconds } : null,
    preparationShots: lane.preparationShots.map((s) => s.score.value),
    matchShots: lane.matchShots.map((s) => s.score.value),
    shootoffShots: lane.shootoffShots.map((s) => s.score.value),
    eliminated: lane.eliminated,
    eliminationRank: lane.eliminationRank,
    totalScore: lane.displayTotalScore,
    stage1Total: lane.stage1Total,
    stage2Total: lane.stage2Total,
    seriesScores: lane.displaySeriesScores,
    recentShots: lane.recentShots,
    shotNumber: lane.displayShotCount,
    lastScore: lane.lastScore,
    lastShotTime: lane.lastShotTime,
    remainingTime: lane.remainingTime,
    relayNumber: lane.relayNumber,
  };
}

export class GetAllLaneControlsHandler {
  constructor(private readonly repository: ILaneControlRepository) {}

  async execute(): Promise<LaneControlDto[]> {
    const lanes = this.repository.findAll();
    return lanes.map(toDto);
  }
}
