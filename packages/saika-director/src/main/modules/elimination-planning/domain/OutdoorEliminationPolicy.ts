import type { OutdoorEliminationPlanningCapability } from '@sasakiuri/saika-rules';

export interface TechnicalDelegateEliminationWaiver {
  readonly authorityRole: 'TECHNICAL_DELEGATE';
  readonly officialName: string;
  readonly reason: 'SCHEDULE_LIMITATIONS';
  readonly statement: string;
}

export interface OutdoorEliminationPlanInput {
  readonly entryCount: number;
  readonly usableFiringPoints: number;
  /** Supply after the random relay draw to calculate announcement-ready quotas. */
  readonly relayStartCounts?: readonly number[];
  readonly waiver?: TechnicalDelegateEliminationWaiver;
}

export interface EliminationRelayQuota {
  readonly relayNumber: number;
  readonly startCount: number;
  readonly rawQuota: number;
  readonly qualifyCount: number;
}

export interface EliminationPlanningFinding {
  readonly code: string;
  readonly severity: 'INFO' | 'WARNING' | 'BLOCKING';
  readonly message: string;
  readonly ruleReference: string;
}

export interface OutdoorEliminationPlan {
  readonly status: 'NOT_REQUIRED' | 'REQUIRED' | 'PLANNED' | 'WAIVED';
  readonly eliminationRequired: boolean;
  readonly entryCount: number;
  readonly usableFiringPoints: number;
  readonly minimumRelayCount: number;
  readonly qualificationPlaces: number;
  readonly relayQuotas: readonly EliminationRelayQuota[];
  readonly waiver: TechnicalDelegateEliminationWaiver | null;
  readonly findings: readonly EliminationPlanningFinding[];
}

/**
 * Pure ISSF 6.6.6.1 venue policy. It calculates and explains a plan, but does
 * not draw athletes, approve a plan, publish a start list, or advance results.
 */
export class OutdoorEliminationPolicy {
  constructor(private readonly capability: OutdoorEliminationPlanningCapability) {}

  plan(input: OutdoorEliminationPlanInput): OutdoorEliminationPlan {
    positiveInteger(input.entryCount, 'entryCount');
    positiveInteger(input.usableFiringPoints, 'usableFiringPoints');
    if (input.usableFiringPoints < this.capability.minimumQualificationAthletes) {
      throw new Error(
        `Usable capacity ${input.usableFiringPoints} is below the required minimum of ${this.capability.minimumQualificationAthletes} Qualification athletes`,
      );
    }

    const eliminationRequired = input.entryCount > input.usableFiringPoints;
    const minimumRelayCount = Math.max(1, Math.ceil(input.entryCount / input.usableFiringPoints));
    const common = {
      eliminationRequired,
      entryCount: input.entryCount,
      usableFiringPoints: input.usableFiringPoints,
      minimumRelayCount,
      qualificationPlaces: Math.min(input.entryCount, input.usableFiringPoints),
    };

    if (!eliminationRequired) {
      if (input.waiver) throw new Error('An Elimination waiver is invalid when all athletes fit in one relay');
      if (input.relayStartCounts) this.validateNoEliminationRelayCounts(input.relayStartCounts, input.entryCount);
      return {
        ...common,
        status: 'NOT_REQUIRED',
        relayQuotas: [],
        waiver: null,
        findings: [
          {
            code: 'ELIMINATION_NOT_REQUIRED',
            severity: 'INFO',
            message: 'All entered athletes fit within the usable outdoor range capacity.',
            ruleReference: 'ISSF 6.6.6.1',
          },
        ],
      };
    }

    if (input.waiver) {
      validateWaiver(input.waiver);
      return {
        ...common,
        status: 'WAIVED',
        relayQuotas: [],
        waiver: { ...input.waiver },
        findings: [
          {
            code: 'TECHNICAL_DELEGATE_WAIVER',
            severity: 'WARNING',
            message: `Technical Delegate ${input.waiver.officialName} waived Elimination because of schedule limitations.`,
            ruleReference: 'ISSF 6.6.6.1',
          },
        ],
      };
    }

    if (!input.relayStartCounts) {
      return {
        ...common,
        status: 'REQUIRED',
        relayQuotas: [],
        waiver: null,
        findings: [
          ...this.standardFindings(),
          {
            code: 'RELAY_START_COUNTS_REQUIRED',
            severity: 'BLOCKING',
            message: 'Complete the random relay draw before calculating and announcing Qualification quotas.',
            ruleReference: 'ISSF 6.6.6.1(b), (d-e)',
          },
        ],
      };
    }

    validateRelayCounts(input.relayStartCounts, input.entryCount, input.usableFiringPoints, minimumRelayCount);
    const relayQuotas = proportionalQuotas(input.relayStartCounts, input.usableFiringPoints);
    return {
      ...common,
      status: 'PLANNED',
      relayQuotas,
      waiver: null,
      findings: [
        ...this.standardFindings(),
        {
          code: 'QUOTAS_REQUIRE_ANNOUNCEMENT',
          severity: 'WARNING',
          message: 'The calculated relay quotas must be announced at the Technical Meeting before Elimination.',
          ruleReference: 'ISSF 6.6.6.1(d-e)',
        },
      ],
    };
  }

  private standardFindings(): EliminationPlanningFinding[] {
    return [
      {
        code: 'FULL_COURSE_REQUIRED',
        severity: 'INFO',
        message: 'Each Elimination relay uses the complete course of fire.',
        ruleReference: 'ISSF 6.6.6.1(a)',
      },
      {
        code: 'RANDOM_BALANCED_DRAW_REQUIRED',
        severity: 'INFO',
        message: 'Use a random draw that distributes team members and nations equally between relays.',
        ruleReference: 'ISSF 6.6.6.1(b), (f-g)',
      },
      {
        code: 'SCHEDULE_DAY_BEFORE',
        severity: 'INFO',
        message: `Schedule Elimination ${this.capability.preferredDaysBeforeQualification} day before Qualification when practicable.`,
        ruleReference: 'ISSF 6.6.6.1(c)',
      },
    ];
  }

  private validateNoEliminationRelayCounts(counts: readonly number[], entryCount: number): void {
    if (counts.length !== 1 || counts[0] !== entryCount) {
      throw new Error('A non-Elimination plan must contain exactly one relay with every entry');
    }
  }
}

function proportionalQuotas(relayStartCounts: readonly number[], qualificationPlaces: number): EliminationRelayQuota[] {
  const total = relayStartCounts.reduce((sum, count) => sum + count, 0);
  const rows = relayStartCounts.map((startCount, index) => {
    const rawQuota = (qualificationPlaces / total) * startCount;
    return {
      relayNumber: index + 1,
      startCount,
      rawQuota,
      qualifyCount: Math.floor(rawQuota),
      fraction: rawQuota - Math.floor(rawQuota),
    };
  });
  const remaining = qualificationPlaces - rows.reduce((sum, row) => sum + row.qualifyCount, 0);
  const priority = [...rows].sort(
    (left, right) => right.fraction - left.fraction || left.relayNumber - right.relayNumber,
  );
  for (let index = 0; index < remaining; index += 1) priority[index % priority.length]!.qualifyCount += 1;
  return rows.map(({ fraction: _fraction, ...row }) => row);
}

function validateRelayCounts(
  counts: readonly number[],
  entryCount: number,
  capacity: number,
  minimumRelayCount: number,
): void {
  if (counts.length < minimumRelayCount) {
    throw new Error(`At least ${minimumRelayCount} Elimination relays are required for the selected capacity`);
  }
  counts.forEach((count, index) => {
    positiveInteger(count, `relayStartCounts[${index}]`);
    if (count > capacity) throw new Error(`Relay ${index + 1} exceeds usable capacity ${capacity}`);
  });
  if (counts.reduce((sum, count) => sum + count, 0) !== entryCount) {
    throw new Error('Relay start counts must equal the entry count');
  }
}

function validateWaiver(waiver: TechnicalDelegateEliminationWaiver): void {
  if (!waiver.officialName.trim()) throw new Error('Technical Delegate name is required for an Elimination waiver');
  if (!waiver.statement.trim()) throw new Error('An Elimination waiver statement is required');
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
}
