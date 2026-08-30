import type { MixedTeamFinalDecisionDto } from '@/shared/ipc/contracts';

export interface MixedTeamFinalEntryInput {
  id: string;
  decisionId: string;
  entryType: 'COMMAND_BATCH' | 'VOID';
  commandResults: MixedTeamFinalDecisionDto['commandAttempts'][number]['laneResults'] | null;
  statement: string;
  officialName: string;
  recordedAt: string;
}

export interface IMixedTeamFinalControlRepository {
  appendDecision(
    decision: Omit<MixedTeamFinalDecisionDto, 'voided' | 'commandCompleted' | 'latestLaneStatuses' | 'commandAttempts'>,
  ): void;
  appendEntry(input: MixedTeamFinalEntryInput): void;
  findByCompetition(competitionId: string): MixedTeamFinalDecisionDto[];
  findById(id: string): MixedTeamFinalDecisionDto | null;
}
