import type {
  DeclareFinalResultsPayload,
  FinalResultDeclarationDto,
  FinalResultDeclarationStatusDto,
} from '@/shared/ipc/contracts';

import type { IResultPublicationReadiness, ResultPublicationReadiness } from './ResultPublicationPorts';
import { FinalResultDeclaration } from '../domain/FinalResultDeclaration';
import type { IFinalResultDeclarationRepository } from '../domain/IFinalResultDeclarationRepository';

/** Final-only declaration workflow; it intentionally has no preliminary score-protest window. */
export class FinalResultDeclarationService {
  constructor(
    private readonly repository: IFinalResultDeclarationRepository,
    private readonly readiness: IResultPublicationReadiness,
  ) {}

  async getStatus(eventId: string): Promise<FinalResultDeclarationStatusDto> {
    const readiness = await this.readiness.getCurrent(eventId, 'FINAL');
    const declaration = this.repository.findByEvent(eventId);
    const issues = declaration ? declarationIssues(declaration, readiness) : readinessIssues(readiness);
    return {
      eventId,
      currentSnapshotRevision: readiness.snapshotRevision,
      currentApprovalId: readiness.approvalId,
      declaration: declaration ? toDto(declaration) : null,
      declarationCurrent: declaration !== null && issues.length === 0,
      canDeclare: declaration === null && issues.length === 0,
      issues,
    };
  }

  async declare(input: DeclareFinalResultsPayload): Promise<FinalResultDeclarationStatusDto> {
    if (this.repository.findByEvent(input.eventId)) {
      throw new Error('Final results have already been declared; use the event correction procedure for changes');
    }
    const readiness = await this.readiness.getCurrent(input.eventId, 'FINAL');
    const issues = readinessIssues(readiness);
    if (issues.length > 0) throw new Error(`Final results cannot be declared: ${issues.join('; ')}`);
    const declaration = FinalResultDeclaration.create({
      eventId: input.eventId,
      snapshotRevision: readiness.snapshotRevision!,
      approvalId: readiness.approvalId!,
      finalProtestsResolved: input.finalProtestsResolved,
      resultProcessConfirmed: input.resultProcessConfirmed,
      statement: input.statement,
      officialName: input.officialName,
    });
    this.repository.append(declaration);
    return this.getStatus(input.eventId);
  }
}

function readinessIssues(readiness: ResultPublicationReadiness): string[] {
  const issues: string[] = [];
  if (!readiness.supported) issues.push('Final result verification is not supported');
  if (readiness.resultCount === 0 || readiness.snapshotRevision === null) {
    issues.push('No complete Final result list is available');
  }
  if (readiness.approvalId === null || readiness.approvalSnapshotRevision === null) {
    issues.push('A current RTS Final result-list approval is required');
  } else if (readiness.snapshotRevision !== null && readiness.approvalSnapshotRevision !== readiness.snapshotRevision) {
    issues.push('The RTS approval covers another Final result-list revision');
  }
  return [...new Set([...issues, ...readiness.verificationIssues])];
}

function declarationIssues(declaration: FinalResultDeclaration, readiness: ResultPublicationReadiness): string[] {
  const issues = readinessIssues(readiness);
  if (declaration.snapshotRevision !== readiness.snapshotRevision || declaration.approvalId !== readiness.approvalId) {
    issues.unshift('The current Final result or RTS approval no longer matches the RESULTS ARE FINAL declaration');
  }
  return [...new Set(issues)];
}

function toDto(declaration: FinalResultDeclaration): FinalResultDeclarationDto {
  return {
    id: declaration.id,
    eventId: declaration.eventId,
    snapshotRevision: declaration.snapshotRevision,
    approvalId: declaration.approvalId,
    finalProtestsResolved: declaration.finalProtestsResolved,
    resultProcessConfirmed: declaration.resultProcessConfirmed,
    statement: declaration.statement,
    officialName: declaration.officialName,
    ruleReference: declaration.ruleReference,
    declaredAt: declaration.declaredAt.toISOString(),
  };
}
