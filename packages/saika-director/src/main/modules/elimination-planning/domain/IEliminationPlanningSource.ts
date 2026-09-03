export interface EliminationPlanningSourceSnapshot {
  readonly competitionTypeId: string;
  readonly entryCount: number;
  /** Present only when every starting athlete has exactly one current assignment. */
  readonly relayStartCounts?: readonly number[];
  readonly sourceHash: string;
}

export interface IEliminationPlanningSource {
  get(eventId: string): EliminationPlanningSourceSnapshot | null;
}
