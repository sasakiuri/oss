export const COMPETITION_DATA_OPERATIONS = ['LEAVE_LANE', 'RESET_LANE_SESSION', 'CLEAR_COMPETITION_DATA'] as const;

export type CompetitionDataOperation = (typeof COMPETITION_DATA_OPERATIONS)[number];

export interface CompetitionDataOperationContext {
  operation: CompetitionDataOperation;
  competitionId: string;
  laneId?: string;
}

/** Port used by competition-control consumers before an evidence-destructive operation. */
export interface ICompetitionDataGuard {
  assertAllowed(context: CompetitionDataOperationContext): void;
}
