import type {
  CreateEstInspectionPlanPayload,
  EstChampionshipInspectionAssessmentDto,
  RecordEstInspectionPayload,
  RevokeEstInspectionPayload,
} from '@/shared/ipc/contracts';

import type { IEstChampionshipInspectionRepository } from '../domain/IEstChampionshipInspectionRepository';
import {
  EstInspectionEntry,
  EstInspectionPlan,
  IssfEstChampionshipInspectionPolicy,
  type IEstChampionshipInspectionPolicy,
} from '../domain/EstChampionshipInspection';

export class EstChampionshipInspectionService {
  constructor(
    private readonly repository: IEstChampionshipInspectionRepository,
    private readonly policy: IEstChampionshipInspectionPolicy = new IssfEstChampionshipInspectionPolicy(),
  ) {}

  async get(championshipId: string): Promise<EstChampionshipInspectionAssessmentDto> {
    const plan = this.repository.findPlans(championshipId).at(-1) ?? null;
    if (!plan) return { plan: null, ready: false, ruleReference: 'ISSF 6.3.2.8', targets: [], history: [] };
    return this.project(plan);
  }

  async createPlan(input: CreateEstInspectionPlanPayload): Promise<EstChampionshipInspectionAssessmentDto> {
    const versionNumber = (this.repository.findPlans(input.championshipId).at(-1)?.versionNumber ?? 0) + 1;
    const plan = EstInspectionPlan.create({ ...input, versionNumber });
    this.repository.appendPlan(plan);
    return this.project(plan);
  }

  async record(input: RecordEstInspectionPayload): Promise<EstChampionshipInspectionAssessmentDto> {
    const plan = this.requirePlan(input.planId);
    const targetIdentifiers = [...new Set(input.targetIdentifiers.map((value) => value.trim()))];
    const planned = new Set(plan.targetIdentifiers);
    const unknown = targetIdentifiers.filter((target) => !planned.has(target));
    if (unknown.length > 0) throw new Error(`Targets are not in this inspection plan: ${unknown.join(', ')}`);
    this.repository.appendEntries(
      targetIdentifiers.map((targetIdentifier) =>
        EstInspectionEntry.create({
          planId: plan.id,
          targetIdentifier,
          outcome: input.outcome,
          statement: input.statement,
          ...(input.evidenceReference ? { evidenceReference: input.evidenceReference } : {}),
          performedBy: input.performedBy,
          technicalDelegateName: input.technicalDelegateName,
          inspectedAt: new Date(input.inspectedAt),
        }),
      ),
    );
    return this.project(plan);
  }

  async revoke(input: RevokeEstInspectionPayload): Promise<EstChampionshipInspectionAssessmentDto> {
    const plan = this.requirePlan(input.planId);
    const entry = this.repository.findEntryById(input.entryId);
    if (!entry || entry.planId !== plan.id || entry.revokedEntryId) {
      throw new Error('Only an inspection outcome from this plan can be revoked');
    }
    const entries = this.repository.findEntries(plan.id);
    if (entries.some((candidate) => candidate.revokedEntryId === entry.id)) {
      throw new Error('This inspection outcome is already revoked');
    }
    this.repository.appendEntries([
      EstInspectionEntry.create({
        planId: plan.id,
        targetIdentifier: entry.targetIdentifier,
        outcome: entry.outcome,
        statement: input.statement,
        performedBy: input.performedBy,
        technicalDelegateName: input.technicalDelegateName,
        inspectedAt: new Date(),
        revokedEntryId: entry.id,
      }),
    ]);
    return this.project(plan);
  }

  private requirePlan(planId: string): EstInspectionPlan {
    const plan = this.repository.findPlanById(planId);
    if (!plan) throw new Error(`EST inspection plan ${planId} not found`);
    return plan;
  }

  private project(plan: EstInspectionPlan): EstChampionshipInspectionAssessmentDto {
    const history = this.repository.findEntries(plan.id);
    const assessment = this.policy.assess(plan, history);
    return {
      plan: {
        id: plan.id,
        championshipId: plan.championshipId,
        versionNumber: plan.versionNumber,
        targetIdentifiers: [...plan.targetIdentifiers],
        methodStatement: plan.methodStatement,
        createdBy: plan.createdBy,
        createdAt: plan.createdAt.toISOString(),
      },
      ready: assessment.ready,
      ruleReference: assessment.ruleReference,
      targets: assessment.targets.map((target) => ({
        targetIdentifier: target.targetIdentifier,
        status: target.status,
        latestEntry: target.latestEntry ? toEntryDto(target.latestEntry) : null,
      })),
      history: history.map(toEntryDto),
    };
  }
}

function toEntryDto(entry: EstInspectionEntry) {
  return {
    id: entry.id,
    planId: entry.planId,
    targetIdentifier: entry.targetIdentifier,
    outcome: entry.outcome,
    statement: entry.statement,
    evidenceReference: entry.evidenceReference,
    performedBy: entry.performedBy,
    technicalDelegateName: entry.technicalDelegateName,
    inspectedAt: entry.inspectedAt.toISOString(),
    recordedAt: entry.recordedAt.toISOString(),
    revokedEntryId: entry.revokedEntryId,
  };
}
