import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type {
  CreateOutdoorEliminationPlanPayload,
  OutdoorEliminationPlanDto,
  OutdoorEliminationPlanEntryPayload,
} from '@/shared/ipc/contracts';

import type { IEliminationPlanningSource } from '../domain/IEliminationPlanningSource';
import type {
  IOutdoorEliminationPlanRepository,
  OutdoorEliminationPlanEntryRecord,
  OutdoorEliminationPlanEntryType,
  OutdoorEliminationPlanRecord,
} from '../domain/IOutdoorEliminationPlanRepository';
import { OutdoorEliminationPolicy } from '../domain/OutdoorEliminationPolicy';

export class OutdoorEliminationPlanningService {
  constructor(
    private readonly repository: IOutdoorEliminationPlanRepository,
    private readonly source: IEliminationPlanningSource,
    private readonly competitionTypes: CompetitionTypeRegistry,
    private readonly clock: { now(): Date } = { now: () => new Date() },
  ) {}

  list(eventId: string): OutdoorEliminationPlanDto[] {
    return this.repository.findByEvent(eventId).map((plan) => this.toDto(plan));
  }

  create(input: CreateOutdoorEliminationPlanPayload): OutdoorEliminationPlanDto {
    const source = this.requireSource(input.eventId);
    if (source.entryCount === 0) throw new Error('At least one starting athlete is required for an Elimination plan');
    const definition = this.competitionTypes.get(source.competitionTypeId);
    const capability = definition.outdoorEliminationPlanning;
    if (definition.config.name !== 'Elimination' || !capability || !definition.rulePackIdentity) {
      throw new Error(`Event type ${definition.id} is not an outdoor Elimination Rule Pack`);
    }
    const planInput = {
      entryCount: source.entryCount,
      usableFiringPoints: input.usableFiringPoints,
      ...(source.relayStartCounts ? { relayStartCounts: source.relayStartCounts } : {}),
      ...(input.waiver ? { waiver: input.waiver } : {}),
    };
    const projection = new OutdoorEliminationPolicy(capability).plan(planInput);
    const record = {
      id: crypto.randomUUID(),
      eventId: input.eventId,
      competitionTypeId: definition.id,
      rulePackIdentity: definition.rulePackIdentity,
      sourceHash: source.sourceHash,
      input: planInput,
      projection,
      createdBy: input.createdBy.trim(),
      createdAt: this.clock.now().toISOString(),
    } satisfies Omit<OutdoorEliminationPlanRecord, 'entries'>;
    this.repository.appendPlan(record);
    return this.toDto(this.requirePlan(record.id));
  }

  approve(input: OutdoorEliminationPlanEntryPayload): OutdoorEliminationPlanDto {
    const plan = this.requireCurrent(input.planId);
    if (plan.projection.status === 'REQUIRED')
      throw new Error('Complete and apply the relay assignment before approval');
    if (entry(plan, 'APPROVED')) throw new Error('This Elimination plan is already approved');
    this.repository.appendEntry(this.newEntry(plan.id, 'APPROVED', input));
    return this.toDto(this.requirePlan(plan.id));
  }

  announceQuotas(input: OutdoorEliminationPlanEntryPayload): OutdoorEliminationPlanDto {
    const plan = this.requireCurrent(input.planId);
    if (plan.projection.status !== 'PLANNED')
      throw new Error('Only a proportional Elimination quota plan can be announced');
    if (!entry(plan, 'APPROVED')) throw new Error('Technical Delegate approval is required before quota announcement');
    if (entry(plan, 'QUOTAS_ANNOUNCED')) throw new Error('These Elimination quotas are already announced');
    this.repository.appendEntry(this.newEntry(plan.id, 'QUOTAS_ANNOUNCED', input));
    return this.toDto(this.requirePlan(plan.id));
  }

  voidPlan(input: OutdoorEliminationPlanEntryPayload): OutdoorEliminationPlanDto {
    const plan = this.requirePlan(input.planId);
    if (entry(plan, 'VOID')) return this.toDto(plan);
    this.repository.appendEntry(this.newEntry(plan.id, 'VOID', input));
    return this.toDto(this.requirePlan(plan.id));
  }

  private requireCurrent(planId: string): OutdoorEliminationPlanRecord {
    const plan = this.requirePlan(planId);
    if (entry(plan, 'VOID')) throw new Error('This Elimination plan is void');
    if (this.isStale(plan)) throw new Error('The event entries or firing-point assignments changed; create a new plan');
    return plan;
  }

  private requirePlan(planId: string): OutdoorEliminationPlanRecord {
    const plan = this.repository.findById(planId);
    if (!plan) throw new Error(`Outdoor Elimination plan not found: ${planId}`);
    return plan;
  }

  private requireSource(eventId: string) {
    const source = this.source.get(eventId);
    if (!source) throw new Error(`Event not found: ${eventId}`);
    return source;
  }

  private isStale(plan: OutdoorEliminationPlanRecord): boolean {
    return this.source.get(plan.eventId)?.sourceHash !== plan.sourceHash;
  }

  private newEntry(
    planId: string,
    entryType: OutdoorEliminationPlanEntryType,
    input: OutdoorEliminationPlanEntryPayload,
  ): OutdoorEliminationPlanEntryRecord {
    return {
      id: crypto.randomUUID(),
      planId,
      entryType,
      officialName: input.officialName.trim(),
      statement: input.statement.trim(),
      recordedAt: this.clock.now().toISOString(),
    };
  }

  private toDto(plan: OutdoorEliminationPlanRecord): OutdoorEliminationPlanDto {
    const toEntry = (value: OutdoorEliminationPlanEntryRecord | null) =>
      value
        ? {
            id: value.id,
            entryType: value.entryType,
            officialName: value.officialName,
            statement: value.statement,
            recordedAt: value.recordedAt,
          }
        : null;
    return {
      id: plan.id,
      eventId: plan.eventId,
      competitionTypeId: plan.competitionTypeId,
      rulePackIdentity: plan.rulePackIdentity,
      sourceHash: plan.sourceHash,
      entryCount: plan.input.entryCount,
      usableFiringPoints: plan.input.usableFiringPoints,
      relayStartCounts: [...(plan.input.relayStartCounts ?? [])],
      status: plan.projection.status,
      eliminationRequired: plan.projection.eliminationRequired,
      minimumRelayCount: plan.projection.minimumRelayCount,
      qualificationPlaces: plan.projection.qualificationPlaces,
      relayQuotas: plan.projection.relayQuotas.map((quota) => ({ ...quota })),
      findings: plan.projection.findings.map((finding) => ({ ...finding })),
      waiver: plan.projection.waiver ? { ...plan.projection.waiver } : null,
      createdBy: plan.createdBy,
      createdAt: plan.createdAt,
      stale: this.isStale(plan),
      approval: toEntry(entry(plan, 'APPROVED')),
      quotaAnnouncement: toEntry(entry(plan, 'QUOTAS_ANNOUNCED')),
      voidEntry: toEntry(entry(plan, 'VOID')),
    };
  }
}

function entry(plan: OutdoorEliminationPlanRecord, type: OutdoorEliminationPlanEntryType) {
  return plan.entries.find((candidate) => candidate.entryType === type) ?? null;
}
