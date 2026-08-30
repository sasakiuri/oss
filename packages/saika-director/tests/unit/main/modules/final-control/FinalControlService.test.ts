import { ISSF_2026_AR60_FINAL } from '@sasakiuri/saika-rules';
import { describe, expect, it } from 'vitest';
import {
  FinalControlService,
  type FinalControlEntryInput,
  type IFinalControlRepository,
} from '@/main/modules/final-control';
import { CompetitionTypeRegistry, competitionTypeFromRulePack } from '@/shared/competitionTypes';
import type { FinalControlDecisionDto, FinalControlLaneSnapshotDto } from '@/shared/ipc/contracts';

class MemoryRepository implements IFinalControlRepository {
  decisions: FinalControlDecisionDto[] = [];
  appendDecision(decision: Omit<FinalControlDecisionDto, 'voided' | 'commandCompleted' | 'commandAttempts'>): void {
    this.decisions.push({ ...decision, voided: false, commandCompleted: false, commandAttempts: [] });
  }
  appendEntry(input: FinalControlEntryInput): void {
    const index = this.decisions.findIndex((decision) => decision.id === input.decisionId);
    const decision = this.decisions[index]!;
    this.decisions[index] =
      input.entryType === 'VOID'
        ? { ...decision, voided: true }
        : {
            ...decision,
            commandCompleted: decision.commandCompleted || input.commandStatus === 'DONE',
            commandAttempts: [
              ...decision.commandAttempts,
              {
                id: input.id,
                commandId: input.commandId!,
                status: input.commandStatus!,
                statement: input.statement,
                officialName: input.officialName,
                recordedAt: input.recordedAt,
              },
            ],
          };
  }
  findByCompetition(competitionId: string): FinalControlDecisionDto[] {
    return this.decisions.filter((decision) => decision.competitionId === competitionId);
  }
  findById(id: string): FinalControlDecisionDto | null {
    return this.decisions.find((decision) => decision.id === id) ?? null;
  }
}

const competitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const commandId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const lanes: FinalControlLaneSnapshotDto[] = Array.from({ length: 8 }, (_, index) => ({
  laneId: `${index + 1}1111111-1111-4111-8111-111111111111`,
  athleteName: `Athlete ${index + 1}`,
  totalShotCount: 12,
  totalScoreX10: 1000 + index * 10,
  finished: false,
}));

function createService(repository = new MemoryRepository()) {
  const registry = new CompetitionTypeRegistry();
  registry.register(competitionTypeFromRulePack(ISSF_2026_AR60_FINAL));
  return { service: new FinalControlService(repository, registry), repository };
}

describe('FinalControlService', () => {
  it('separates the placing decision from the Lane command result', () => {
    const { service } = createService();
    const decision = service.recordDecision({
      competitionId,
      competitionTypeId: 'AR60_FINAL',
      participantCount: 8,
      lanes,
      selectedLaneId: lanes[0]!.laneId,
      resolution: 'CLEAR_LOWEST',
      officialName: 'Jury A',
    });
    expect(decision.commandCompleted).toBe(false);

    const completed = service.recordCommandResult({
      decisionId: decision.id,
      commandId,
      status: 'DONE',
      statement: 'Lane acknowledged final snapshot',
      officialName: 'CRO A',
    });
    expect(completed.commandCompleted).toBe(true);
    expect(() =>
      service.voidDecision({
        decisionId: decision.id,
        reason: 'mistake',
        officialName: 'Jury A',
      }),
    ).toThrow('cannot be voided');
  });

  it('rejects a tied checkpoint without a shoot-off or Jury statement', () => {
    const { service } = createService();
    const tied = lanes.map((lane, index) => ({ ...lane, totalScoreX10: index < 2 ? 1000 : lane.totalScoreX10 }));
    expect(() =>
      service.recordDecision({
        competitionId,
        competitionTypeId: 'AR60_FINAL',
        participantCount: 8,
        lanes: tied,
        selectedLaneId: tied[0]!.laneId,
        resolution: 'SHOOT_OFF',
        officialName: 'Jury A',
      }),
    ).toThrow('resolution statement');
  });
});
