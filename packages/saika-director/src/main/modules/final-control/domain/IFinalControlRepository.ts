import type { FinalControlDecisionDto } from '@/shared/ipc/contracts';

export interface FinalControlEntryInput {
  id: string;
  decisionId: string;
  entryType: 'COMMAND_RESULT' | 'VOID';
  commandId: string | null;
  commandStatus: 'DONE' | 'ERROR' | 'TIMEOUT' | null;
  statement: string;
  officialName: string;
  recordedAt: string;
}

export interface IFinalControlRepository {
  appendDecision(decision: Omit<FinalControlDecisionDto, 'voided' | 'commandCompleted' | 'commandAttempts'>): void;
  appendEntry(input: FinalControlEntryInput): void;
  findByCompetition(competitionId: string): FinalControlDecisionDto[];
  findById(id: string): FinalControlDecisionDto | null;
}
