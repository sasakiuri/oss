import { ResultPublication, type ResultPublicationStatus } from '../domain/ResultPublication';
import type { IResultPublicationRepository } from '../domain/IResultPublicationRepository';
import type { ResultPublicationEntry, ResultPublicationScope } from '../domain/ResultPublicationEntry';
import type {
  IResultPublicationPolicyResolver,
  IResultPublicationReadiness,
  PublicationClock,
  ResultPublicationReadiness,
} from './ResultPublicationPorts';

export interface ResultPublicationView {
  readonly eventId: string;
  readonly resultScope: ResultPublicationScope;
  readonly status: ResultPublicationStatus;
  readonly preliminaryId: string | null;
  readonly publicationSnapshotRevision: string | null;
  readonly currentSnapshotRevision: string | null;
  readonly publicationCurrent: boolean;
  readonly postedAt: Date | null;
  readonly protestEndsAt: Date | null;
  readonly openProtestReferences: readonly string[];
  readonly officialPublishedAt: Date | null;
  readonly approvalId: string | null;
  readonly canRegisterProtest: boolean;
  readonly canPublishOfficial: boolean;
  readonly issues: readonly string[];
  readonly history: readonly ResultPublicationEntry[];
}

export class ResultPublicationService {
  constructor(
    private readonly repository: IResultPublicationRepository,
    private readonly readiness: IResultPublicationReadiness,
    private readonly policies: IResultPublicationPolicyResolver,
    private readonly clock: PublicationClock = { now: () => new Date() },
  ) {}

  async getStatus(eventId: string, resultScope: ResultPublicationScope): Promise<ResultPublicationView> {
    const now = this.clock.now();
    const publication = this.load(eventId, resultScope);
    const state = publication.stateAt(now);
    const readiness = await this.readiness.getCurrent(eventId, resultScope);
    const issues = buildOfficialPublicationIssues(state, readiness, now);
    const sameRevision =
      state.snapshotRevision !== null &&
      readiness.snapshotRevision !== null &&
      state.snapshotRevision === readiness.snapshotRevision;
    const officialWorkflowCurrent =
      state.status !== 'OFFICIAL' ||
      (state.approvalId === readiness.approvalId &&
        readiness.approvalSnapshotRevision === readiness.snapshotRevision &&
        readiness.verificationIssues.length === 0);
    return {
      eventId,
      resultScope,
      status: state.status,
      preliminaryId: state.preliminaryId,
      publicationSnapshotRevision: state.snapshotRevision,
      currentSnapshotRevision: readiness.snapshotRevision,
      publicationCurrent: sameRevision && officialWorkflowCurrent,
      postedAt: state.postedAt,
      protestEndsAt: state.protestEndsAt,
      openProtestReferences: state.openProtestReferences,
      officialPublishedAt: state.officialPublishedAt,
      approvalId: state.approvalId,
      canRegisterProtest:
        state.preliminaryId !== null &&
        state.status !== 'OFFICIAL' &&
        state.protestEndsAt !== null &&
        now.getTime() < state.protestEndsAt.getTime(),
      canPublishOfficial: state.status !== 'OFFICIAL' && issues.length === 0,
      issues,
      history: publication.entries,
    };
  }

  async publishPreliminary(input: {
    eventId: string;
    resultScope: ResultPublicationScope;
    officialName: string;
  }): Promise<ResultPublicationView> {
    const readiness = await this.readiness.getCurrent(input.eventId, input.resultScope);
    if (!readiness.supported) throw new Error(`Result publication is not supported for ${input.resultScope}`);
    if (readiness.resultCount === 0 || readiness.snapshotRevision === null) {
      throw new Error('No result list is available for preliminary publication');
    }
    const policy = await this.policies.resolve(input.eventId, input.resultScope);
    const publication = this.load(input.eventId, input.resultScope);
    const entry = publication.publishPreliminary({
      snapshotRevision: readiness.snapshotRevision,
      postedAt: this.clock.now(),
      protestWindowMs: policy.scoreProtestWindowMs,
      officialName: input.officialName,
    });
    this.repository.append(entry);
    return this.getStatus(input.eventId, input.resultScope);
  }

  async registerProtest(input: {
    eventId: string;
    resultScope: ResultPublicationScope;
    protestReference: string;
  }): Promise<ResultPublicationView> {
    const publication = this.load(input.eventId, input.resultScope);
    const entry = publication.registerProtest({
      protestReference: input.protestReference,
      registeredAt: this.clock.now(),
    });
    this.repository.append(entry);
    return this.getStatus(input.eventId, input.resultScope);
  }

  async resolveProtest(input: {
    eventId: string;
    resultScope: ResultPublicationScope;
    protestReference: string;
    resolution: string;
    officialName: string;
  }): Promise<ResultPublicationView> {
    const publication = this.load(input.eventId, input.resultScope);
    const entry = publication.resolveProtest({
      protestReference: input.protestReference,
      resolution: input.resolution,
      officialName: input.officialName,
      resolvedAt: this.clock.now(),
    });
    this.repository.append(entry);
    return this.getStatus(input.eventId, input.resultScope);
  }

  async publishOfficial(input: {
    eventId: string;
    resultScope: ResultPublicationScope;
    officialName: string;
  }): Promise<ResultPublicationView> {
    const readiness = await this.readiness.getCurrent(input.eventId, input.resultScope);
    if (!readiness.supported) throw new Error(`Result publication is not supported for ${input.resultScope}`);
    if (!readiness.snapshotRevision) throw new Error('No current result-list revision is available');
    if (!readiness.approvalId || !readiness.approvalSnapshotRevision) {
      throw new Error('A current RTS result-list approval is required');
    }
    const publication = this.load(input.eventId, input.resultScope);
    const publishedAt = this.clock.now();
    const issues = buildOfficialPublicationIssues(publication.stateAt(publishedAt), readiness, publishedAt);
    if (issues.length > 0) {
      throw new Error(`Official results cannot be published: ${issues.join('; ')}`);
    }
    const entry = publication.publishOfficial({
      currentSnapshotRevision: readiness.snapshotRevision,
      approvalSnapshotRevision: readiness.approvalSnapshotRevision,
      approvalId: readiness.approvalId,
      officialName: input.officialName,
      publishedAt,
    });
    this.repository.append(entry);
    return this.getStatus(input.eventId, input.resultScope);
  }

  private load(eventId: string, resultScope: ResultPublicationScope): ResultPublication {
    return ResultPublication.reconstruct(eventId, resultScope, this.repository.findByEvent(eventId, resultScope));
  }
}

function buildOfficialPublicationIssues(
  state: ReturnType<ResultPublication['stateAt']>,
  readiness: ResultPublicationReadiness,
  now: Date,
): string[] {
  if (state.status === 'OFFICIAL') {
    const issues: string[] = [];
    if (
      state.snapshotRevision !== null &&
      readiness.snapshotRevision !== null &&
      state.snapshotRevision !== readiness.snapshotRevision
    ) {
      issues.push('The current result list no longer matches the official publication');
    }
    if (state.approvalId !== readiness.approvalId) {
      issues.push('The current RTS approval no longer matches the official publication');
    }
    if (
      readiness.snapshotRevision !== null &&
      readiness.approvalSnapshotRevision !== null &&
      readiness.approvalSnapshotRevision !== readiness.snapshotRevision
    ) {
      issues.push('The current RTS approval covers another result-list revision');
    }
    return [...new Set([...issues, ...readiness.verificationIssues])];
  }
  const issues: string[] = [];
  if (!readiness.supported) issues.push('This result scope does not yet support official publication');
  if (readiness.resultCount === 0 || readiness.snapshotRevision === null)
    issues.push('No current result list is available');
  if (state.preliminaryId === null || state.snapshotRevision === null)
    issues.push('Preliminary results have not been published');
  if (
    state.snapshotRevision !== null &&
    readiness.snapshotRevision !== null &&
    state.snapshotRevision !== readiness.snapshotRevision
  ) {
    issues.push('The result list changed after preliminary publication');
  }
  if (state.protestEndsAt !== null && now.getTime() < state.protestEndsAt.getTime()) {
    issues.push('The score protest window is still open');
  }
  if (state.openProtestReferences.length > 0) issues.push('At least one score protest is unresolved');
  if (readiness.approvalId === null || readiness.approvalSnapshotRevision === null) {
    issues.push('A current RTS result-list approval is required');
  } else if (state.snapshotRevision !== null && readiness.approvalSnapshotRevision !== state.snapshotRevision) {
    issues.push('The current RTS approval covers another result-list revision');
  }
  return [...new Set([...issues, ...readiness.verificationIssues])];
}
