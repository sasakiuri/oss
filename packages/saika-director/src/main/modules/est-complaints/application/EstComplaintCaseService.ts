import type {
  EstComplaintObservationDto,
  OpenEstComplaintTargetExaminationPayload,
  OpenEstComplaintTargetExaminationResultDto,
} from '@/shared/ipc/contracts';

import { EstComplaintCasePolicy } from '../domain/EstComplaintCasePolicy';
import { estComplaintSnapshotHash } from '../domain/EstComplaintSnapshot';
import type { EstComplaintCaseLink, IEstComplaintCaseLinkRepository } from '../domain/IEstComplaintCaseLinkRepository';
import { EstComplaintTimingPolicy } from '../domain/EstComplaintTimingPolicy';
import type { EstComplaintSignalSnapshot, IEstComplaintSignalSource } from '../domain/IEstComplaintSignalSource';
import type { ITargetExaminationCaseGateway } from '../domain/ITargetExaminationCaseGateway';

export class EstComplaintCaseService {
  constructor(
    private readonly signals: IEstComplaintSignalSource,
    private readonly links: IEstComplaintCaseLinkRepository,
    private readonly examinations: ITargetExaminationCaseGateway,
    private readonly timingPolicy = new EstComplaintTimingPolicy(),
    private readonly casePolicy = new EstComplaintCasePolicy(),
  ) {}

  listByCompetition(competitionId: string): EstComplaintObservationDto[] {
    const linked = this.links.findByCompetitionId(competitionId);
    const bySignalId = new Map(linked.map((link) => [link.signalId, link.snapshot]));
    for (const signal of this.signals.listByCompetition(competitionId)) bySignalId.set(signal.signalId, signal);
    const linksBySignalId = new Map(linked.map((link) => [link.signalId, link]));
    return [...bySignalId.values()]
      .sort((left, right) => left.signalledAt.getTime() - right.signalledAt.getTime())
      .map((signal) => this.toDto(signal, linksBySignalId.get(signal.signalId) ?? null));
  }

  openTargetExamination(input: OpenEstComplaintTargetExaminationPayload): OpenEstComplaintTargetExaminationResultDto {
    const existing = this.links.findBySignalId(input.signalId);
    if (existing) {
      return {
        created: false,
        targetExaminationCaseId: existing.targetExaminationCaseId,
        observation: this.toDto(this.signals.findById(input.signalId) ?? existing.snapshot, existing),
      };
    }

    const signal = this.signals.findById(input.signalId);
    if (!signal) throw new Error(`Lane EST complaint ${input.signalId} has not been observed by Director`);

    return this.links.executeInTransaction(() => {
      const concurrent = this.links.findBySignalId(input.signalId);
      if (concurrent) {
        return {
          created: false,
          targetExaminationCaseId: concurrent.targetExaminationCaseId,
          observation: this.toDto(signal, concurrent),
        };
      }

      const plan = this.casePolicy.plan(signal);
      const examination = this.examinations.create({
        scopes: [{ scopeType: 'COMPETITION', scopeId: signal.context.competitionId }],
        issueKind: plan.issueKind,
        occurredAt: signal.signalledAt.toISOString(),
        laneId: signal.laneId,
        ...(signal.firingPointNumber ? { firingPointNumber: signal.firingPointNumber } : {}),
        ...(input.relayNumber ? { relayNumber: input.relayNumber } : {}),
        athleteName: signal.context.participantName,
        ...(plan.shotId ? { shotId: plan.shotId } : {}),
        summary: plan.summary,
        details: plan.details,
        ruleReferences: plan.ruleReferences,
        openedBy: input.openedBy,
      });
      const linkedAt = new Date();
      const link: EstComplaintCaseLink = {
        signalId: signal.signalId,
        targetExaminationCaseId: examination.id,
        snapshot: signal,
        snapshotSha256: estComplaintSnapshotHash(signal),
        linkedBy: input.openedBy,
        linkedAt,
      };
      this.links.append(link);
      return {
        created: true,
        targetExaminationCaseId: examination.id,
        observation: this.toDto(signal, link),
      };
    });
  }

  private toDto(signal: EstComplaintSignalSnapshot, link: EstComplaintCaseLink | null): EstComplaintObservationDto {
    return {
      signalId: signal.signalId,
      laneId: signal.laneId,
      firingPointNumber: signal.firingPointNumber,
      status: signal.status,
      issue: signal.issue,
      context: structuredClone(signal.context),
      message: signal.message,
      signalledAt: signal.signalledAt.toISOString(),
      timing: this.timingPolicy.assess(signal),
      targetExaminationCaseId: link?.targetExaminationCaseId ?? null,
      linkedBy: link?.linkedBy ?? null,
      linkedAt: link?.linkedAt.toISOString() ?? null,
    };
  }
}
