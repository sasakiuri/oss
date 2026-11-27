export const COMPETITION_DATA_OPERATIONS = ['LEAVE_LANE', 'RESET_LANE_SESSION', 'CLEAR_COMPETITION_DATA'] as const;

export type CompetitionDataOperation = (typeof COMPETITION_DATA_OPERATIONS)[number];

export interface CompetitionDataOperationContext {
  operation: CompetitionDataOperation;
  competitionId: string;
  laneId?: string;
}

/** Names the operation in a guard's refusal, e.g. "before resetting the Lane session". */
export function competitionDataOperationLabel(operation: CompetitionDataOperation): string {
  switch (operation) {
    case 'LEAVE_LANE':
      return 'removing the Lane';
    case 'RESET_LANE_SESSION':
      return 'resetting the Lane session';
    case 'CLEAR_COMPETITION_DATA':
      return 'clearing competition data';
  }
}

/** Port used by competition-control consumers before an evidence-destructive operation. */
export interface ICompetitionDataGuard {
  assertAllowed(context: CompetitionDataOperationContext): void;
}
