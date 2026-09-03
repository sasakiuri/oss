import type { RulePackIdentity } from '@sasakiuri/saika-rules';

import type { OutdoorEliminationPlan, OutdoorEliminationPlanInput } from './OutdoorEliminationPolicy';

export type OutdoorEliminationPlanEntryType = 'APPROVED' | 'QUOTAS_ANNOUNCED' | 'VOID';

export interface OutdoorEliminationPlanEntryRecord {
  readonly id: string;
  readonly planId: string;
  readonly entryType: OutdoorEliminationPlanEntryType;
  readonly officialName: string;
  readonly statement: string;
  readonly recordedAt: string;
}

export interface OutdoorEliminationPlanRecord {
  readonly id: string;
  readonly eventId: string;
  readonly competitionTypeId: string;
  readonly rulePackIdentity: RulePackIdentity;
  readonly sourceHash: string;
  readonly input: OutdoorEliminationPlanInput;
  readonly projection: OutdoorEliminationPlan;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly entries: readonly OutdoorEliminationPlanEntryRecord[];
}

export interface IOutdoorEliminationPlanRepository {
  appendPlan(plan: Omit<OutdoorEliminationPlanRecord, 'entries'>): void;
  appendEntry(entry: OutdoorEliminationPlanEntryRecord): void;
  findByEvent(eventId: string): OutdoorEliminationPlanRecord[];
  findById(planId: string): OutdoorEliminationPlanRecord | null;
}
