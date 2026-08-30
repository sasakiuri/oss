import type { TeamTieBreakPolicy } from '../domain/TeamResultPolicy';

/** Resolves event-specific ranking rules without coupling team aggregation to event persistence. */
export interface ITeamTieBreakPolicyResolver {
  resolve(eventId: string): Promise<TeamTieBreakPolicy>;
}
