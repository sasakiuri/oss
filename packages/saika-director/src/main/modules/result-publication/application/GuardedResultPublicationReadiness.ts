import type { ResultScope } from '@/shared/ipc/contracts';
import type {
  IResultPublicationBlocker,
  IResultPublicationReadiness,
  ResultPublicationReadiness,
} from './ResultPublicationPorts';

/** Decorates any scoring-readiness source with independently replaceable operational holds. */
export class GuardedResultPublicationReadiness implements IResultPublicationReadiness {
  constructor(
    private readonly source: IResultPublicationReadiness,
    private readonly blockers: readonly IResultPublicationBlocker[],
  ) {}

  async getCurrent(eventId: string, resultScope: ResultScope): Promise<ResultPublicationReadiness> {
    const readiness = await this.source.getCurrent(eventId, resultScope);
    const blockerIssues = (
      await Promise.all(this.blockers.map((blocker) => blocker.getIssues(eventId, resultScope)))
    ).flat();
    return {
      ...readiness,
      verificationIssues: [...new Set([...readiness.verificationIssues, ...blockerIssues])],
    };
  }
}
