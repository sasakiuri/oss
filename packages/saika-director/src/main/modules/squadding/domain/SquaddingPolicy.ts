import type { SquaddingAssignmentDto, SquaddingFindingDto } from '@/shared/ipc/contracts';

export const SQUADDING_ALGORITHM_VERSION = 'ISSF_2026_V2';

export type SquaddingEntryStatus = 'COMPETING' | 'RPO' | 'MQS' | 'OOC' | 'DNS' | 'DNF' | 'DSQ' | 'DQB';

export interface SquaddingParticipant {
  id: string;
  nationCode: string | null;
  gender: 'M' | 'F' | 'X' | 'UNSPECIFIED';
  entryStatus: SquaddingEntryStatus;
  teamId: string | null;
}

export interface SquaddingPolicyInput {
  participants: readonly SquaddingParticipant[];
  seed: string;
  relayCount: number;
  firstFiringPoint: number;
  firingPointCount: number;
  statusSectionPolicy: 'OFF' | 'END_OF_RELAY';
  teamFormat?: 'MIXED_PAIR';
  round?: 'Qualification' | 'Final';
}

export interface SquaddingPolicyResult {
  assignments: SquaddingAssignmentDto[];
  findings: SquaddingFindingDto[];
}

interface AllocationUnit {
  id: string;
  nationCode: string;
  teamId: string | null;
  members: SquaddingParticipant[];
  section: 'COMPETING' | 'SPECIAL';
}

/** Pure, seeded allocation policy. Persistence and Technical Delegate approval are separate ports. */
export class IssfSquaddingPolicy {
  draw(input: SquaddingPolicyInput): SquaddingPolicyResult {
    validateGeometry(input);
    const eligible = input.participants.filter((participant) => isStartingStatus(participant.entryStatus));
    const excluded = input.participants.length - eligible.length;
    if (eligible.length === 0) throw new Error('No starting participants are available for the draw');
    const missingNation = eligible.find((participant) => !participant.nationCode);
    if (missingNation) throw new Error(`Participant ${missingNation.id} has no official nation code`);

    const mixed = input.teamFormat === 'MIXED_PAIR';
    const units = mixed ? mixedTeamUnits(eligible) : individualUnits(eligible);
    const unitCapacityPerRelay = mixed ? Math.floor(input.firingPointCount / 2) : input.firingPointCount;
    if (unitCapacityPerRelay < 1 || units.length > unitCapacityPerRelay * input.relayCount) {
      throw new Error(
        `Range capacity is ${unitCapacityPerRelay * input.relayCount} ${mixed ? 'teams' : 'athletes'}, but ${units.length} must be allocated`,
      );
    }

    const random = seededRandom(input.seed);
    const allocated = findAllocation(
      units,
      input.relayCount,
      unitCapacityPerRelay,
      input.statusSectionPolicy,
      random,
      mixed,
    );
    if (!allocated) {
      throw new Error(
        'No allocation satisfies the selected range geometry and ISSF adjacency/equal-relay constraints; change the relay or firing-point count',
      );
    }

    const assignments: SquaddingAssignmentDto[] = [];
    allocated.forEach((relay, relayIndex) => {
      relay.forEach((unit, unitIndex) => {
        const base = input.firstFiringPoint + unitIndex * (mixed ? 2 : 1);
        if (mixed) {
          const female = unit.members.find((member) => member.gender === 'F')!;
          const male = unit.members.find((member) => member.gender === 'M')!;
          assignments.push({ relayNumber: relayIndex + 1, firingPointNumber: base, participantId: female.id });
          assignments.push({ relayNumber: relayIndex + 1, firingPointNumber: base + 1, participantId: male.id });
        } else {
          assignments.push({
            relayNumber: relayIndex + 1,
            firingPointNumber: base,
            participantId: unit.members[0]!.id,
          });
        }
      });
    });

    const findings: SquaddingFindingDto[] = [
      {
        code: 'SEEDED_RANDOM_DRAW',
        severity: 'INFO',
        message: `Computer draw completed with reproducible seed “${input.seed}”.`,
        ruleReference: 'ISSF 6.6.6 a-b',
      },
      {
        code: 'NATION_ADJACENCY_CHECKED',
        severity: 'INFO',
        message: mixed
          ? 'Different teams from the same nation are not adjacent.'
          : 'Athletes from the same nation are not on adjacent firing points.',
        ruleReference:
          mixed && input.round === 'Final' ? 'ISSF 6.6.6 e, 6.18.3.5 a' : mixed ? 'ISSF 6.18.2.2 b' : 'ISSF 6.6.6 e',
      },
    ];
    if (input.relayCount > 1) {
      findings.push({
        code: 'RELAY_BALANCE_CHECKED',
        severity: 'INFO',
        message: 'Nation entries are distributed as equally as possible between relays.',
        ruleReference: 'ISSF 6.6.6 d, f',
      });
    }
    if (mixed) {
      findings.push({
        code: input.round === 'Final' ? 'MIXED_FINAL_PAIR_POSITION_DEFAULT' : 'MIXED_PAIR_ORDER_CHECKED',
        severity: input.round === 'Final' ? 'WARNING' : 'INFO',
        message:
          input.round === 'Final'
            ? 'Teams are allocated as adjacent pairs with female-left as the default. A notified Final member-position change must be applied separately in the manual firing-point grid.'
            : 'Each Mixed Team pair is adjacent with the female athlete on the left.',
        ruleReference: input.round === 'Final' ? 'ISSF 6.18.3.5 a-b' : 'ISSF 6.18.2.2 c',
      });
    } else if (eligible.some((participant) => participant.teamId) && input.relayCount > 1) {
      findings.push({
        code: 'TEAM_RELAY_BALANCE_CHECKED',
        severity: 'INFO',
        message: 'Members sharing a Team ID are distributed equally between relays.',
        ruleReference: 'ISSF 6.6.6 h',
      });
    }
    if (input.round !== 'Final') {
      findings.push({
        code: 'STATUS_SECTION_POLICY',
        severity: input.statusSectionPolicy === 'OFF' ? 'INFO' : 'WARNING',
        message:
          input.statusSectionPolicy === 'OFF'
            ? 'No special range section was imposed for MQS-only, RPO or OOC athletes.'
            : 'MQS-only, RPO and OOC athletes are grouped at the end of each relay; the Technical Delegate must approve this range constraint.',
        ruleReference: 'ISSF 6.6.6 c',
      });
    }
    if (excluded > 0) {
      findings.push({
        code: 'NON_STARTERS_EXCLUDED',
        severity: 'WARNING',
        message: `${excluded} DNS/DNF/DSQ/DQB participant(s) were excluded from the draw.`,
        ruleReference: 'ISSF 6.6.5, 6.14.4.2',
      });
    }
    return { assignments, findings };
  }
}

function validateGeometry(input: SquaddingPolicyInput): void {
  for (const [name, value] of [
    ['relayCount', input.relayCount],
    ['firstFiringPoint', input.firstFiringPoint],
    ['firingPointCount', input.firingPointCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  }
}

function isStartingStatus(status: SquaddingEntryStatus): boolean {
  return status === 'COMPETING' || status === 'RPO' || status === 'MQS' || status === 'OOC';
}

function individualUnits(participants: readonly SquaddingParticipant[]): AllocationUnit[] {
  return participants.map((participant) => ({
    id: participant.id,
    nationCode: participant.nationCode!,
    teamId: participant.teamId,
    members: [participant],
    section: participant.entryStatus === 'COMPETING' ? 'COMPETING' : 'SPECIAL',
  }));
}

function mixedTeamUnits(participants: readonly SquaddingParticipant[]): AllocationUnit[] {
  const byTeam = new Map<string, SquaddingParticipant[]>();
  for (const participant of participants) {
    if (!participant.teamId) throw new Error(`Mixed Team participant ${participant.id} has no Team ID`);
    const members = byTeam.get(participant.teamId) ?? [];
    members.push(participant);
    byTeam.set(participant.teamId, members);
  }
  const nationTeamCounts = new Map<string, number>();
  const units: AllocationUnit[] = [];
  for (const [teamId, members] of byTeam) {
    if (members.length !== 2) throw new Error(`Mixed Team ${teamId} must contain exactly two athletes`);
    if (members.some((member) => member.entryStatus !== 'COMPETING')) {
      throw new Error(`Mixed Team ${teamId} contains a non-competing entry`);
    }
    const female = members.filter((member) => member.gender === 'F');
    const male = members.filter((member) => member.gender === 'M');
    if (female.length !== 1 || male.length !== 1) {
      throw new Error(`Mixed Team ${teamId} must contain one female and one male athlete`);
    }
    const nations = new Set(members.map((member) => member.nationCode));
    if (nations.size !== 1) throw new Error(`Mixed Team ${teamId} members must represent the same nation`);
    const nationCode = members[0]!.nationCode!;
    nationTeamCounts.set(nationCode, (nationTeamCounts.get(nationCode) ?? 0) + 1);
    units.push({ id: teamId, nationCode, teamId, members, section: 'COMPETING' });
  }
  const excessiveNation = [...nationTeamCounts].find(([, count]) => count > 2);
  if (excessiveNation) {
    throw new Error(`Nation ${excessiveNation[0]} has ${excessiveNation[1]} Mixed Teams; the maximum is two`);
  }
  return units;
}

function findAllocation(
  units: readonly AllocationUnit[],
  relayCount: number,
  capacityPerRelay: number,
  statusPolicy: SquaddingPolicyInput['statusSectionPolicy'],
  random: () => number,
  mixed: boolean,
): AllocationUnit[][] | null {
  const nationFrequency = frequencies(units.map((unit) => unit.nationCode));
  const teamFrequency = frequencies(units.flatMap((unit) => (unit.teamId ? [unit.teamId] : [])));
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const relays = Array.from({ length: relayCount }, () => [] as AllocationUnit[]);
    const ordered = shuffle(units, random).sort(
      (left, right) =>
        (nationFrequency.get(right.nationCode) ?? 0) - (nationFrequency.get(left.nationCode) ?? 0) ||
        (right.teamId ? (teamFrequency.get(right.teamId) ?? 0) : 0) -
          (left.teamId ? (teamFrequency.get(left.teamId) ?? 0) : 0),
    );
    for (const unit of ordered) {
      const candidates = shuffle(
        relays.map((relay, index) => ({ relay, index })).filter(({ relay }) => relay.length < capacityPerRelay),
        random,
      ).sort((left, right) => {
        const nationDelta =
          countKey(left.relay, unit.nationCode, 'nationCode') - countKey(right.relay, unit.nationCode, 'nationCode');
        if (nationDelta !== 0) return nationDelta;
        if (!mixed && unit.teamId) {
          const teamDelta = countKey(left.relay, unit.teamId, 'teamId') - countKey(right.relay, unit.teamId, 'teamId');
          if (teamDelta !== 0) return teamDelta;
        }
        return left.relay.length - right.relay.length;
      });
      candidates[0]?.relay.push(unit);
    }
    if (relays.some((relay) => relay.length > capacityPerRelay)) continue;
    if (
      !balancedAcrossRelays(
        relays,
        units.map((unit) => unit.nationCode),
        'nationCode',
      )
    )
      continue;
    const teamIds = units.flatMap((unit) => (unit.teamId && !mixed ? [unit.teamId] : []));
    if (!balancedAcrossRelays(relays, teamIds, 'teamId')) continue;

    const sequenced = relays.map((relay) => orderRelay(relay, statusPolicy, random));
    if (sequenced.every((relay): relay is AllocationUnit[] => relay !== null)) return sequenced;
  }
  return null;
}

function orderRelay(
  units: readonly AllocationUnit[],
  statusPolicy: SquaddingPolicyInput['statusSectionPolicy'],
  random: () => number,
): AllocationUnit[] | null {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sections =
      statusPolicy === 'END_OF_RELAY'
        ? [units.filter((unit) => unit.section === 'COMPETING'), units.filter((unit) => unit.section === 'SPECIAL')]
        : [[...units]];
    const result: AllocationUnit[] = [];
    let previousNation: string | null = null;
    let valid = true;
    for (const section of sections) {
      const ordered = orderSection(section, previousNation, random);
      if (!ordered) {
        valid = false;
        break;
      }
      result.push(...ordered);
      previousNation = result.at(-1)?.nationCode ?? previousNation;
    }
    if (valid) return result;
  }
  return null;
}

function orderSection(
  source: readonly AllocationUnit[],
  previousNation: string | null,
  random: () => number,
): AllocationUnit[] | null {
  const remaining = [...source];
  const result: AllocationUnit[] = [];
  let previous = previousNation;
  while (remaining.length > 0) {
    const candidates = shuffle(
      remaining.filter((unit) => unit.nationCode !== previous),
      random,
    );
    if (candidates.length === 0) return null;
    const counts = frequencies(remaining.map((unit) => unit.nationCode));
    candidates.sort((left, right) => (counts.get(right.nationCode) ?? 0) - (counts.get(left.nationCode) ?? 0));
    const selected = candidates[0]!;
    result.push(selected);
    remaining.splice(remaining.indexOf(selected), 1);
    previous = selected.nationCode;
  }
  return result;
}

function balancedAcrossRelays(
  relays: readonly AllocationUnit[][],
  keys: readonly string[],
  property: 'nationCode' | 'teamId',
): boolean {
  for (const key of new Set(keys)) {
    const counts = relays.map((relay) => countKey(relay, key, property));
    if (Math.max(...counts) - Math.min(...counts) > 1) return false;
  }
  return true;
}

function countKey(relay: readonly AllocationUnit[], value: string, property: 'nationCode' | 'teamId'): number {
  return relay.filter((unit) => unit[property] === value).length;
}

function frequencies(values: readonly string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function shuffle<T>(source: readonly T[], random: () => number): T[] {
  const result = [...source];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
