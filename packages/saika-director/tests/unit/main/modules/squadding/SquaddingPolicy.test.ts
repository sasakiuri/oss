import { describe, expect, it } from 'vitest';
import { IssfSquaddingPolicy, type SquaddingParticipant } from '@/main/modules/squadding/domain/SquaddingPolicy';

const policy = new IssfSquaddingPolicy();

function participant(
  id: string,
  nationCode: string,
  options: Partial<SquaddingParticipant> = {},
): SquaddingParticipant {
  return {
    id,
    nationCode,
    gender: 'UNSPECIFIED',
    entryStatus: 'COMPETING',
    teamId: null,
    ...options,
  };
}

describe('IssfSquaddingPolicy', () => {
  it('is reproducible and balances nations and team members between relays', () => {
    const participants = [
      participant('usa-1', 'USA', { teamId: 'team-a' }),
      participant('usa-2', 'USA', { teamId: 'team-a' }),
      participant('jpn-1', 'JPN', { teamId: 'team-b' }),
      participant('jpn-2', 'JPN', { teamId: 'team-b' }),
      participant('ger-1', 'GER'),
      participant('ger-2', 'GER'),
      participant('fra-1', 'FRA'),
      participant('fra-2', 'FRA'),
    ];
    const input = {
      participants,
      seed: 'published-seed-42',
      relayCount: 2,
      firstFiringPoint: 1,
      firingPointCount: 4,
      statusSectionPolicy: 'OFF' as const,
    };
    const first = policy.draw(input);
    const second = policy.draw(input);
    expect(second.assignments).toEqual(first.assignments);

    const byId = new Map(participants.map((entry) => [entry.id, entry]));
    for (const relayNumber of [1, 2]) {
      const relay = first.assignments.filter((assignment) => assignment.relayNumber === relayNumber);
      for (let index = 1; index < relay.length; index += 1) {
        expect(byId.get(relay[index - 1]!.participantId)!.nationCode).not.toBe(
          byId.get(relay[index]!.participantId)!.nationCode,
        );
      }
    }
    for (const nation of ['USA', 'JPN', 'GER', 'FRA']) {
      const counts = [1, 2].map(
        (relayNumber) =>
          first.assignments.filter(
            (assignment) =>
              assignment.relayNumber === relayNumber && byId.get(assignment.participantId)!.nationCode === nation,
          ).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
    for (const teamId of ['team-a', 'team-b']) {
      const counts = [1, 2].map(
        (relayNumber) =>
          first.assignments.filter(
            (assignment) =>
              assignment.relayNumber === relayNumber && byId.get(assignment.participantId)!.teamId === teamId,
          ).length,
      );
      expect(counts).toEqual([1, 1]);
    }
  });

  it('keeps Mixed Team members adjacent, female-left, and separates teams from the same nation', () => {
    const participants = [
      participant('usa-a-f', 'USA', { teamId: 'USA-A', gender: 'F' }),
      participant('usa-a-m', 'USA', { teamId: 'USA-A', gender: 'M' }),
      participant('usa-b-f', 'USA', { teamId: 'USA-B', gender: 'F' }),
      participant('usa-b-m', 'USA', { teamId: 'USA-B', gender: 'M' }),
      participant('jpn-a-f', 'JPN', { teamId: 'JPN-A', gender: 'F' }),
      participant('jpn-a-m', 'JPN', { teamId: 'JPN-A', gender: 'M' }),
      participant('jpn-b-f', 'JPN', { teamId: 'JPN-B', gender: 'F' }),
      participant('jpn-b-m', 'JPN', { teamId: 'JPN-B', gender: 'M' }),
    ];
    const result = policy.draw({
      participants,
      seed: 'mixed-final-seed',
      relayCount: 1,
      firstFiringPoint: 1,
      firingPointCount: 8,
      statusSectionPolicy: 'OFF',
      teamFormat: 'MIXED_PAIR',
      round: 'Qualification',
    });
    const byId = new Map(participants.map((entry) => [entry.id, entry]));
    const ordered = [...result.assignments].sort((left, right) => left.firingPointNumber - right.firingPointNumber);
    const teamOrder: string[] = [];
    for (let index = 0; index < ordered.length; index += 2) {
      const left = byId.get(ordered[index]!.participantId)!;
      const right = byId.get(ordered[index + 1]!.participantId)!;
      expect(left.gender).toBe('F');
      expect(right.gender).toBe('M');
      expect(left.teamId).toBe(right.teamId);
      teamOrder.push(left.teamId!);
    }
    for (let index = 1; index < teamOrder.length; index += 1) {
      const previousNation =
        byId.get(`${teamOrder[index - 1]!.toLowerCase()}-f`)?.nationCode ?? teamOrder[index - 1]!.split('-')[0];
      const nation = teamOrder[index]!.split('-')[0];
      expect(nation).not.toBe(previousNation);
    }
  });

  it('keeps team-pair allocation separate from the permitted Final member-position change', () => {
    const participants = [
      participant('jpn-f', 'JPN', { teamId: 'JPN-A', gender: 'F' }),
      participant('jpn-m', 'JPN', { teamId: 'JPN-A', gender: 'M' }),
      participant('usa-f', 'USA', { teamId: 'USA-A', gender: 'F' }),
      participant('usa-m', 'USA', { teamId: 'USA-A', gender: 'M' }),
    ];
    const result = policy.draw({
      participants,
      seed: 'mixed-final-position-seed',
      relayCount: 1,
      firstFiringPoint: 1,
      firingPointCount: 4,
      statusSectionPolicy: 'OFF',
      teamFormat: 'MIXED_PAIR',
      round: 'Final',
    });

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: 'MIXED_FINAL_PAIR_POSITION_DEFAULT',
        severity: 'WARNING',
        ruleReference: 'ISSF 6.18.3.5 a-b',
      }),
    );
    expect(result.findings.some((finding) => finding.code === 'MIXED_PAIR_ORDER_CHECKED')).toBe(false);
  });

  it('places MQS/RPO/OOC entries at the approved end section without consuming non-starter capacity', () => {
    const participants = [
      participant('comp-usa', 'USA'),
      participant('comp-jpn', 'JPN'),
      participant('rpo-ger', 'GER', { entryStatus: 'RPO' }),
      participant('mqs-fra', 'FRA', { entryStatus: 'MQS' }),
      participant('dns-ita', 'ITA', { entryStatus: 'DNS' }),
    ];
    const result = policy.draw({
      participants,
      seed: 'section-seed',
      relayCount: 1,
      firstFiringPoint: 5,
      firingPointCount: 4,
      statusSectionPolicy: 'END_OF_RELAY',
    });
    const order = result.assignments
      .sort((left, right) => left.firingPointNumber - right.firingPointNumber)
      .map((assignment) => assignment.participantId);
    expect(new Set(order.slice(0, 2))).toEqual(new Set(['comp-usa', 'comp-jpn']));
    expect(new Set(order.slice(2))).toEqual(new Set(['rpo-ger', 'mqs-fra']));
    expect(order).not.toContain('dns-ita');
  });
});
