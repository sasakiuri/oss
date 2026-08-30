export interface MixedTeamFinalMemberResult {
  participantId: string;
  playerName: string;
  gender: 'M' | 'F' | 'X' | 'UNSPECIFIED';
  firingPointNumber: number;
  stage1Shots: number[];
  stage2Shots: number[];
  totalScore: number;
}

export interface MixedTeamFinalResultRecord {
  id: string;
  eventId: string;
  sourceCompetitionId: string;
  teamId: string;
  teamName: string;
  nationCode: string;
  members: MixedTeamFinalMemberResult[];
  stage1Total: number;
  stage2Total: number;
  totalScore: number;
  finalRank: number;
  eliminatedAtShot: number | null;
  shootoffId: string | null;
  remarks: string;
  createdAt: string;
}

export interface IMixedTeamFinalResultRepository {
  replaceByEvent(eventId: string, results: readonly MixedTeamFinalResultRecord[]): void;
  findByEvent(eventId: string): MixedTeamFinalResultRecord[];
}
