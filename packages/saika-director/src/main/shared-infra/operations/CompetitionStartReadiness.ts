/** Independent readiness providers share only the intended phase and actual joined Lanes. */
export interface CompetitionStartScope {
  readonly competitionId: string;
  readonly phase: 'SIGHTING' | 'MATCH';
  readonly laneIds: readonly string[];
}
export interface CompetitionStartIssue {
  readonly code: string;
  readonly message: string;
  readonly blocking: boolean;
}
export interface ICompetitionStartReadinessSource {
  getStartIssues(scope: CompetitionStartScope): readonly CompetitionStartIssue[];
}
export interface ICompetitionStartReadiness extends ICompetitionStartReadinessSource {
  assertAllowed(scope: CompetitionStartScope): void;
}

export class CompetitionStartReadiness implements ICompetitionStartReadiness {
  constructor(private readonly sources: readonly ICompetitionStartReadinessSource[]) {}
  getStartIssues(scope: CompetitionStartScope): readonly CompetitionStartIssue[] {
    return this.sources.flatMap((source) => source.getStartIssues(scope));
  }
  assertAllowed(scope: CompetitionStartScope): void {
    const issues = this.getStartIssues(scope).filter((issue) => issue.blocking);
    if (issues.length)
      throw new Error(`Cannot start ${scope.phase}: ${issues.map((issue) => issue.message).join('; ')}`);
  }
}
