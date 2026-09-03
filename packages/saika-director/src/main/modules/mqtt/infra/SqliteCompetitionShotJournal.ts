import type Database from 'better-sqlite3';

import type { CompetitionShotObservation, ICompetitionShotJournal } from '../domain/ICompetitionShotJournal';

interface CompetitionShotObservationRow {
  id: string;
  competition_id: string;
  lane_id: string;
  session_id: string;
  shot_id: string;
  source_observation_id: string | null;
  x: number | null;
  y: number | null;
  legacy_raw_score_x10: number;
  device_score_x10: number | null;
  calculated_score_x10: number;
  calculated_score_available: number;
  effective_score_x10: number;
  target_profile_id: string | null;
  scoring_gauge_profile_id: string | null;
  inner_ten: number;
  mode: 'SIGHTING' | 'MATCH';
  fired_at: string;
  received_at: string;
  stage_index: number;
  scored: number;
  series_index: number;
  shot_number_in_series: number;
  is_recorded: number;
  is_replay: number;
  published_at: string;
  observed_at: string;
  payload_json: string;
}

export class SqliteCompetitionShotJournal implements ICompetitionShotJournal {
  constructor(private readonly db: Database.Database) {}

  append(observation: CompetitionShotObservation): void {
    this.db
      .prepare(
        `INSERT INTO mqtt_competition_shot_observations (
           id, competition_id, lane_id, session_id, shot_id, source_observation_id,
           x, y, legacy_raw_score_x10, device_score_x10, calculated_score_x10,
           calculated_score_available, effective_score_x10, target_profile_id, scoring_gauge_profile_id,
           inner_ten, mode, fired_at, received_at, stage_index,
           scored, series_index, shot_number_in_series, is_recorded, is_replay,
           published_at, observed_at, payload_json
         ) VALUES (
           @id, @competitionId, @laneId, @sessionId, @shotId, @sourceObservationId,
           @x, @y, @legacyRawScoreX10, @deviceScoreX10, @calculatedScoreX10,
           @calculatedScoreAvailable, @effectiveScoreX10, @targetProfileId, @scoringGaugeProfileId,
           @innerTen, @mode, @firedAt, @receivedAt, @stageIndex,
           @scored, @seriesIndex, @shotNumberInSeries, @isRecorded, @isReplay,
           @publishedAt, @observedAt, @payloadJson
         )`,
      )
      .run({
        ...observation,
        innerTen: Number(observation.innerTen),
        calculatedScoreAvailable: Number(observation.calculatedScoreAvailable),
        scored: Number(observation.scored),
        isRecorded: Number(observation.isRecorded),
        isReplay: Number(observation.isReplay),
        firedAt: observation.firedAt.toISOString(),
        receivedAt: observation.receivedAt.toISOString(),
        publishedAt: observation.publishedAt.toISOString(),
        observedAt: observation.observedAt.toISOString(),
      });
  }

  findByCompetition(competitionId: string): CompetitionShotObservation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mqtt_competition_shot_observations
         WHERE competition_id = ?
         ORDER BY observed_at, id`,
      )
      .all(competitionId) as CompetitionShotObservationRow[];
    return rows.map(toDomain);
  }
}

function toDomain(row: CompetitionShotObservationRow): CompetitionShotObservation {
  return {
    id: row.id,
    competitionId: row.competition_id,
    laneId: row.lane_id,
    sessionId: row.session_id,
    shotId: row.shot_id,
    sourceObservationId: row.source_observation_id,
    x: row.x,
    y: row.y,
    legacyRawScoreX10: row.legacy_raw_score_x10,
    deviceScoreX10: row.device_score_x10,
    calculatedScoreX10: row.calculated_score_x10,
    calculatedScoreAvailable: row.calculated_score_available === 1,
    effectiveScoreX10: row.effective_score_x10,
    targetProfileId: row.target_profile_id,
    scoringGaugeProfileId: row.scoring_gauge_profile_id,
    innerTen: row.inner_ten === 1,
    mode: row.mode,
    firedAt: new Date(row.fired_at),
    receivedAt: new Date(row.received_at),
    stageIndex: row.stage_index,
    scored: row.scored === 1,
    seriesIndex: row.series_index,
    shotNumberInSeries: row.shot_number_in_series,
    isRecorded: row.is_recorded === 1,
    isReplay: row.is_replay === 1,
    publishedAt: new Date(row.published_at),
    observedAt: new Date(row.observed_at),
    payloadJson: row.payload_json,
  };
}
