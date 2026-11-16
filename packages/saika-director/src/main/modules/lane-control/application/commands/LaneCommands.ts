export interface StartPreparationCommand {
  laneIds: string[];
}

export interface AdvanceToNextStageCommand {
  laneIds: string[];
}

export interface StartSeriesCommand {
  laneIds: string[];
}

export interface FinishCommand {
  laneIds: string[];
}

export interface ClearCommand {
  laneIds: string[];
}

export interface AssignPlayersCommand {
  assignments: Array<{
    channel: number;
    playerName: string;
    affiliation: string;
    participantId?: string;
    logoPath?: string;
    relayNumber?: number;
  }>;
  eventType: string;
}

export interface MoveLaneCommand {
  fromLaneId: string;
  toLaneId: string;
}

export interface EditShotCommand {
  laneId: string;
  shotIndex: number;
  newScore: number;
  shotType: 'PREPARATION' | 'MATCH';
}

export interface DeleteShotCommand {
  laneId: string;
  shotIndex: number;
  shotType: 'PREPARATION' | 'MATCH';
}

export interface InsertShotCommand {
  laneId: string;
  shotIndex: number;
  score: number;
  shotType: 'PREPARATION' | 'MATCH';
}

export interface EliminatePlayerCommand {
  laneId: string;
  rank: number;
}
