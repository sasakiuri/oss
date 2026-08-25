export interface FinalBoardLaneData {
  id: string;
  channel: number;
  playerName: string;
  affiliation: string;
  unifiedPhase: string;
  stageName: string;
  stageIndex: number;
  remainingTime: number;
  stage1Shots: number[];
  stage2Shots: number[];
  preparationShots: number[];
  shootoffShots: number[];
  stage1Total: number;
  stage2Total: number;
  totalScore: number;
  eliminated: boolean;
  eliminationRank: number | null;
}

export interface ShootoffState {
  targetLaneIds: string[];
  currentRound: number;
}
