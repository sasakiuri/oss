import type { ResultApprovalScope } from '../domain/ResultListApprovalEntry';

export interface VerificationEvidenceSummary {
  readonly expectedShots: number;
  readonly linkedShots: number;
  readonly independentDecimalShots: number;
  readonly innerTenClassifiedShots: number;
  readonly scoreConflicts: number;
}

/** Scope-neutral result shape consumed by the verification workflow. */
export interface VerifiableResult {
  readonly resultId: string;
  readonly participantId: string;
  readonly revision: string;
  readonly rank: number;
  readonly playerName: string;
  readonly affiliation: string;
  readonly relayNumber: number;
  readonly totalScore: number;
  readonly classificationCode: 'DSQ' | 'DQB' | 'AD_DSQ' | null;
  readonly decisionCount: number;
  readonly projectionIssues: readonly string[];
  /** Normalized workflow state. Final sources map completed placements to confirmed. */
  readonly status: 'published' | 'confirmed';
  readonly evidenceSummary: VerificationEvidenceSummary;
}

export interface ResultVerificationSourceSnapshot {
  readonly eventId: string;
  readonly resultScope: ResultApprovalScope;
  readonly configuredIndividualChecks: number;
  readonly configuredTeamChecks: number;
  readonly teamVerificationSupported: boolean;
  readonly requiredTeamChecks: number;
  readonly checkedTeamResults: number;
  readonly teamVerificationRunId: string | null;
  readonly teamSnapshotRevision: string | null;
  readonly sourceRevision: string | null;
  readonly results: readonly VerifiableResult[];
  readonly issues: readonly string[];
}

export interface IResultVerificationSource {
  readonly resultScope: ResultApprovalScope;
  load(eventId: string): Promise<ResultVerificationSourceSnapshot>;
}

export interface IResultVerificationSourceResolver {
  resolve(resultScope: ResultApprovalScope): IResultVerificationSource;
}

/** Explicit registry keeps adding a new result scope independent from the workflow service. */
export class ResultVerificationSourceRegistry implements IResultVerificationSourceResolver {
  private readonly sources: ReadonlyMap<ResultApprovalScope, IResultVerificationSource>;

  constructor(sources: readonly IResultVerificationSource[]) {
    const entries = sources.map((source) => [source.resultScope, source] as const);
    if (new Set(entries.map(([scope]) => scope)).size !== entries.length) {
      throw new Error('Result verification sources must have unique scopes');
    }
    this.sources = new Map(entries);
  }

  resolve(resultScope: ResultApprovalScope): IResultVerificationSource {
    const source = this.sources.get(resultScope);
    if (!source) throw new Error(`Result verification is not supported for ${resultScope}`);
    return source;
  }
}
