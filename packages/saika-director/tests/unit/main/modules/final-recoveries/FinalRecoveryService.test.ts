import { describe, expect, it } from 'vitest';

import {
  FinalRecoveryService,
  type FinalRecoveryCase,
  type FinalRecoveryEntry,
  type IFinalRecoveryRepository,
} from '@/main/modules/final-recoveries';

const competitionId = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
const laneId = '33333333-3333-4333-8333-333333333333';

class MemoryRepository implements IFinalRecoveryRepository {
  readonly cases: FinalRecoveryCase[] = [];
  readonly entries: FinalRecoveryEntry[] = [];

  appendCase(value: FinalRecoveryCase): void {
    this.cases.push(value);
  }

  appendEntry(value: FinalRecoveryEntry): void {
    this.entries.push(value);
  }

  findCaseById(id: string): FinalRecoveryCase | null {
    return this.cases.find((value) => value.id === id) ?? null;
  }

  findCasesByCompetition(id: string): FinalRecoveryCase[] {
    return this.cases.filter((value) => value.competitionId === id);
  }

  findCasesByEvent(id: string): FinalRecoveryCase[] {
    return this.cases.filter((value) => value.eventId === id);
  }

  findEntries(caseIds: readonly string[]): Map<string, FinalRecoveryEntry[]> {
    return new Map(caseIds.map((id) => [id, this.entries.filter((value) => value.caseId === id)]));
  }
}

describe('FinalRecoveryService', () => {
  it('projects incident-specific ISSF guidance without executing an operational command', () => {
    const service = new FinalRecoveryService(new MemoryRepository());
    const value = service.create({
      competitionId,
      eventId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'INCORRECT_COMMAND',
      phase: 'MATCH_SERIES',
      affectedLaneIds: [laneId],
      summary: 'STOP was called before the athlete completed the series.',
      openedBy: 'Jury A',
    });

    expect(value.status).toBe('OPEN');
    expect(value.guidance.ruleReferences).toEqual(['6.17.1.14(p)']);
    expect(value.guidance.limits.incorrectCommandAdditionalSeconds).toBe(60);
    expect(value.guidance.remedies).toContain('RESTART_WITH_REMAINING_TIME_PLUS_60');
    expect(value.entries).toEqual([]);
  });

  it('requires a ruling before append-only recovery authorization and resumption', () => {
    const repository = new MemoryRepository();
    const service = new FinalRecoveryService(repository);
    let value = service.create({
      competitionId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'MALFUNCTION',
      phase: 'MATCH_SINGLE',
      affectedLaneIds: [laneId],
      summary: 'The firearm did not discharge.',
      openedBy: 'Range Officer A',
    });

    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'REMEDY_AUTHORIZED',
        remedy: 'REPEAT_SINGLE_SHOT',
        statement: 'Repeat the shot.',
        officialName: 'Jury A',
      }),
    ).toThrow('Jury ruling');

    value = service.appendEntry({
      caseId: value.id,
      type: 'JURY_RULING',
      classification: 'ALLOWABLE_MALFUNCTION',
      statement: 'The malfunction is allowable.',
      officialName: 'Range Officer A',
      ruleReference: '6.13.2.1',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'REMEDY_AUTHORIZED',
      remedy: 'REPEAT_SINGLE_SHOT',
      grantedTimeSeconds: 60,
      shotCount: 1,
      statement: 'One repeat shot after repair within one minute.',
      officialName: 'Jury A',
      ruleReference: '6.17.1.6',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'RESUMED',
      statement: 'The finalist was directed to repeat the shot.',
      officialName: 'CRO A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'COMPLETED',
      statement: 'Recovery completed; scoring remains in the scoring-decision ledger.',
      officialName: 'Jury A',
    });

    expect(value.status).toBe('COMPLETED');
    expect(value.entries.map((entry) => entry.type)).toEqual([
      'JURY_RULING',
      'REMEDY_AUTHORIZED',
      'RESUMED',
      'COMPLETED',
    ]);
    expect(repository.entries).toHaveLength(4);
  });

  it('uses the one-per-team malfunction allowance for a Mixed Team Final', () => {
    const service = new FinalRecoveryService(new MemoryRepository());
    const value = service.create({
      competitionId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM',
      incidentType: 'MALFUNCTION',
      phase: 'MATCH_SINGLE',
      affectedLaneIds: [laneId],
      summary: 'One team member reported a firearm malfunction.',
      openedBy: 'Range Officer A',
    });

    expect(value.guidance.ruleReferences).toContain('6.18.1.8');
    expect(value.guidance.checklist.some((item) => item.includes('team has already used'))).toBe(true);
    expect(value.guidance.limits.malfunctionAllowancePerFinal).toBe(1);
  });

  it('supports multi-action EST recovery while retaining the original case facts', () => {
    const service = new FinalRecoveryService(new MemoryRepository());
    let value = service.create({
      competitionId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'EST_FAILURE',
      phase: 'SIGHTING',
      affectedLaneIds: [laneId],
      summary: 'A sighting shot did not register.',
      openedBy: 'CRO A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'STOP_RECORDED',
      statement: 'STOP…UNLOAD issued after the test shot also failed.',
      officialName: 'CRO A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'JURY_RULING',
      classification: 'TARGET_MALFUNCTION',
      statement: 'Target malfunction confirmed.',
      officialName: 'Jury A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'REMEDY_AUTHORIZED',
      remedy: 'MOVE_TO_RESERVE_TARGET',
      statement: 'Move the affected finalist.',
      officialName: 'Jury A',
    });
    value = service.appendEntry({
      caseId: value.id,
      type: 'REMEDY_AUTHORIZED',
      remedy: 'RESTART_PREPARATION_AND_SIGHTING',
      grantedTimeSeconds: 120,
      statement: 'Give all finalists two minutes preparation time and restart.',
      officialName: 'Jury A',
      ruleReference: '6.17.1.8(a)',
    });

    expect(value.status).toBe('RECOVERY_AUTHORIZED');
    expect(value.entries.filter((entry) => entry.type === 'REMEDY_AUTHORIZED')).toHaveLength(2);
    expect(value.summary).toBe('A sighting shot did not register.');
  });

  it('keeps EST replacement guidance specific to each 25m Final procedure', () => {
    const service = new FinalRecoveryService(new MemoryRepository());
    const rapidFire = service.create({
      competitionId,
      procedureProfile: 'PISTOL_25M_RAPID_FIRE',
      incidentType: 'EST_FAILURE',
      phase: 'MATCH_SERIES',
      affectedLaneIds: [laneId],
      summary: 'An unexpected zero was displayed in a rapid-fire series.',
      openedBy: 'Jury A',
    });
    const women = service.create({
      competitionId,
      procedureProfile: 'PISTOL_25M_WOMEN',
      incidentType: 'EST_FAILURE',
      phase: 'MATCH_SERIES',
      affectedLaneIds: [laneId],
      summary: 'An unexpected zero was displayed in a 25m Pistol Women series.',
      openedBy: 'Jury A',
    });

    expect(rapidFire.guidance.remedies).toContain('REPEAT_SERIES');
    expect(rapidFire.guidance.remedies).not.toContain('COMPLETE_SERIES');
    expect(women.guidance.remedies).toContain('COMPLETE_SERIES');
    expect(women.guidance.remedies).not.toContain('REPEAT_SERIES');
    expect(rapidFire.guidance.remedies).not.toContain('GRANT_TWO_MINUTE_SIGHTING');
    expect(rapidFire.guidance.limits.longDelayThresholdSeconds).toBeNull();
    expect(rapidFire.guidance.limits.sightingTimeSeconds).toBeNull();
  });

  it('rejects a classification outside the incident policy before appending it', () => {
    const repository = new MemoryRepository();
    const service = new FinalRecoveryService(repository);
    const value = service.create({
      competitionId,
      procedureProfile: 'RIFLE_PISTOL_10M_50M',
      incidentType: 'MALFUNCTION',
      phase: 'MATCH_SINGLE',
      affectedLaneIds: [laneId],
      summary: 'The firearm did not discharge.',
      openedBy: 'Range Officer A',
    });

    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'JURY_RULING',
        classification: 'TARGET_MALFUNCTION',
        statement: 'Incorrect classification for this case.',
        officialName: 'Jury A',
      }),
    ).toThrow('Classification TARGET_MALFUNCTION is not available');
    expect(repository.entries).toEqual([]);
  });

  it('rejects a recovery action from a different Final procedure', () => {
    const repository = new MemoryRepository();
    const service = new FinalRecoveryService(repository);
    const value = service.create({
      competitionId,
      procedureProfile: 'PISTOL_25M_RAPID_FIRE',
      incidentType: 'EST_FAILURE',
      phase: 'MATCH_SERIES',
      affectedLaneIds: [laneId],
      summary: 'An unexpected zero was displayed in a rapid-fire series.',
      openedBy: 'Jury A',
    });
    service.appendEntry({
      caseId: value.id,
      type: 'JURY_RULING',
      classification: 'TARGET_MALFUNCTION',
      statement: 'Target malfunction confirmed.',
      officialName: 'Jury A',
    });

    expect(() =>
      service.appendEntry({
        caseId: value.id,
        type: 'REMEDY_AUTHORIZED',
        remedy: 'COMPLETE_SERIES',
        statement: 'This remedy belongs to the 25m Pistol Women procedure.',
        officialName: 'Jury A',
      }),
    ).toThrow('Remedy COMPLETE_SERIES is not available');
    expect(repository.entries).toHaveLength(1);
  });
});
