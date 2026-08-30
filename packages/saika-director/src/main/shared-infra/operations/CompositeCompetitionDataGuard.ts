import type { CompetitionDataOperationContext, ICompetitionDataGuard } from './CompetitionDataGuard';

/** Runs independent data-retention policies without coupling their feature modules. */
export class CompositeCompetitionDataGuard implements ICompetitionDataGuard {
  constructor(private readonly guards: readonly ICompetitionDataGuard[]) {}

  assertAllowed(context: CompetitionDataOperationContext): void {
    for (const guard of this.guards) guard.assertAllowed(context);
  }
}
