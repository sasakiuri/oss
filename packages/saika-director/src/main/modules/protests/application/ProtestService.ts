import type {
  CreateProtestPayload,
  ProtestCaseDto,
  ProtestScopePayload,
  RecordProtestEntryPayload,
} from '@/shared/ipc/contracts';

import type { IProtestRepository } from '../domain/IProtestRepository';
import { ProtestCase } from '../domain/ProtestCase';
import { ProtestEntry, protestStatus } from '../domain/ProtestEntry';
import { IssfProtestPolicy, type IProtestPolicy } from '../domain/ProtestPolicy';

export class ProtestService {
  constructor(
    private readonly repository: IProtestRepository,
    private readonly policy: IProtestPolicy = new IssfProtestPolicy(),
  ) {}

  async list(scope: ProtestScopePayload): Promise<ProtestCaseDto[]> {
    return this.project(this.repository.findCasesByScope(scope.scopeType, scope.scopeId));
  }

  async getById(caseId: string): Promise<ProtestCaseDto> {
    const protest = this.repository.findCaseById(caseId);
    if (!protest) throw new Error(`Protest ${caseId} not found`);
    return this.project([protest])[0]!;
  }

  async create(input: CreateProtestPayload): Promise<ProtestCaseDto> {
    if (input.kind === 'APPEAL') {
      const parent = input.parentProtestId ? this.repository.findCaseById(input.parentProtestId) : null;
      if (!parent) throw new Error('The parent protest for this appeal was not found');
      if (parent.scopeType !== input.scopeType || parent.scopeId !== input.scopeId) {
        throw new Error('An appeal must use the same scope as its parent protest');
      }
      if (!this.policy.assess(parent).appealPermitted) throw new Error('This protest decision cannot be appealed');
      if (protestStatus(this.repository.findEntries([parent.id]).get(parent.id) ?? []) === 'VOID') {
        throw new Error('A void protest cannot be appealed');
      }
    }
    const protest = ProtestCase.create({
      ...input,
      lodgedAt: new Date(input.lodgedAt),
      triggeringDecisionAt: input.triggeringDecisionAt ? new Date(input.triggeringDecisionAt) : null,
    });
    this.repository.appendCase(protest);
    return this.project([protest])[0]!;
  }

  async recordEntry(input: RecordProtestEntryPayload): Promise<ProtestCaseDto> {
    const protest = this.repository.findCaseById(input.caseId);
    if (!protest) throw new Error(`Protest ${input.caseId} not found`);
    const entries = this.repository.findEntries([input.caseId]).get(input.caseId) ?? [];
    const status = protestStatus(entries);
    if (status === 'VOID' || status === 'CLOSED')
      throw new Error(`A ${status.toLowerCase()} protest cannot be changed`);
    if (input.type.startsWith('DECIDED_') && status !== 'OPEN') throw new Error('A protest can only be decided once');
    if ((input.type === 'FEE_REFUNDED' || input.type === 'FEE_RETAINED') && status !== 'DECIDED') {
      throw new Error('Record the Jury decision before the fee disposition');
    }
    this.repository.appendEntry(
      ProtestEntry.create({
        ...input,
        occurredAt: new Date(input.occurredAt),
      }),
    );
    return this.project([protest])[0]!;
  }

  private project(cases: readonly ProtestCase[]): ProtestCaseDto[] {
    const entries = this.repository.findEntries(cases.map((item) => item.id));
    return cases.map((protest) => {
      const history = entries.get(protest.id) ?? [];
      const assessment = this.policy.assess(protest);
      return {
        id: protest.id,
        scopeType: protest.scopeType,
        scopeId: protest.scopeId,
        kind: protest.kind,
        parentProtestId: protest.parentProtestId,
        subject: protest.subject,
        statement: protest.statement,
        lodgedBy: protest.lodgedBy,
        lodgedAt: protest.lodgedAt.toISOString(),
        triggeringDecisionAt: protest.triggeringDecisionAt?.toISOString() ?? null,
        formReference: protest.formReference,
        feePaidEuro: protest.feePaidEuro,
        lateAcceptanceReason: protest.lateAcceptanceReason,
        openedBy: protest.openedBy,
        createdAt: protest.createdAt.toISOString(),
        status: protestStatus(history),
        compliance: {
          ...assessment,
          deadlineAt: assessment.deadlineAt?.toISOString() ?? null,
        },
        entries: history.map((entry) => ({
          id: entry.id,
          caseId: entry.caseId,
          type: entry.type,
          statement: entry.statement,
          officialName: entry.officialName,
          ruleReference: entry.ruleReference,
          occurredAt: entry.occurredAt.toISOString(),
          recordedAt: entry.recordedAt.toISOString(),
        })),
      };
    });
  }
}
