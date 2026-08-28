export interface CompetitionShotObservation {
  id: string;
  competitionId: string;
  laneId: string;
  sessionId: string;
  shotId: string;
  sourceObservationId: string | null;
  x: number | null;
  y: number | null;
  legacyRawScoreX10: number;
  deviceScoreX10: number | null;
  calculatedScoreX10: number;
  /** False for legacy payloads where the decimal value was reconstructed from rawScoreX10. */
  calculatedScoreAvailable: boolean;
  effectiveScoreX10: number;
  innerTen: boolean;
  mode: 'SIGHTING' | 'MATCH';
  firedAt: Date;
  receivedAt: Date;
  stageIndex: number;
  scored: boolean;
  seriesIndex: number;
  shotNumberInSeries: number;
  isRecorded: boolean;
  isReplay: boolean;
  publishedAt: Date;
  observedAt: Date;
  payloadJson: string;
}

/** Append-only evidence port; it is intentionally independent from result calculation. */
export interface ICompetitionShotJournal {
  append(observation: CompetitionShotObservation): void;
  findByCompetition(competitionId: string): CompetitionShotObservation[];
}
