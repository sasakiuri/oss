export interface StartShootoffCommand {
  eventId: string;
  targetLaneIds: string[];
  contestedRank: number;
}

export interface AddShootoffShotCommand {
  shootoffId: string;
  laneId: string;
  score: number;
}

export interface CompleteShootoffRoundCommand {
  shootoffId: string;
}

export interface CompleteShootoffRoundResult {
  isResolved: boolean;
  winnerLaneId?: string;
  loserLaneIds?: string[];
  needsNextRound: boolean;
  currentRound: number;
}

export interface ResolveShootoffCommand {
  shootoffId: string;
  rankedLaneIds: string[];
}
