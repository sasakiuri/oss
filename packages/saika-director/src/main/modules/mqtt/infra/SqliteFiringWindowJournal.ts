import type Database from 'better-sqlite3';

import type {
  FiringCommandBoundary,
  FiringWindowViolation,
  IFiringWindowJournal,
} from '../domain/IFiringWindowJournal';

interface FiringCommandBoundaryRow {
  id: string;
  competition_id: string;
  phase: FiringCommandBoundary['phase'];
  transition: FiringCommandBoundary['transition'];
  occurred_at: string;
  command_id: string;
  command_issued_at: string;
  source_action: FiringCommandBoundary['sourceAction'];
  recorded_at: string;
}

interface FiringWindowViolationRow {
  id: string;
  competition_id: string;
  lane_id: string;
  session_id: string;
  shot_id: string;
  observation_id: string;
  shot_mode: FiringWindowViolation['shotMode'];
  policy_rule_id: string;
  kind: FiringWindowViolation['kind'];
  rule_reference: string;
  review_guidance: string;
  timestamp_source: FiringWindowViolation['timestampSource'];
  clock_tolerance_milliseconds: number;
  evaluated_shot_at: string;
  fired_at: string;
  received_at: string;
  observed_at: string;
  decisive_boundary_id: string;
  detected_at: string;
}

export class SqliteFiringWindowJournal implements IFiringWindowJournal {
  constructor(private readonly db: Database.Database) {}

  appendBoundary(boundary: FiringCommandBoundary): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO mqtt_firing_command_boundaries (
           id, competition_id, phase, transition, occurred_at, command_id,
           command_issued_at, source_action, recorded_at
         ) VALUES (
           @id, @competitionId, @phase, @transition, @occurredAt, @commandId,
           @commandIssuedAt, @sourceAction, @recordedAt
         )
         ON CONFLICT (competition_id, command_id, phase, transition) DO NOTHING`,
      )
      .run({
        ...boundary,
        occurredAt: boundary.occurredAt.toISOString(),
        commandIssuedAt: boundary.commandIssuedAt.toISOString(),
        recordedAt: boundary.recordedAt.toISOString(),
      });
    return result.changes === 1;
  }

  findBoundariesByCompetition(competitionId: string): FiringCommandBoundary[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mqtt_firing_command_boundaries
         WHERE competition_id = ?
         ORDER BY occurred_at, recorded_at, id`,
      )
      .all(competitionId) as FiringCommandBoundaryRow[];
    return rows.map(toBoundary);
  }

  appendViolation(violation: FiringWindowViolation): boolean {
    const result = this.db
      .prepare(
        `INSERT INTO mqtt_firing_window_violations (
           id, competition_id, lane_id, session_id, shot_id, observation_id,
           shot_mode, policy_rule_id, kind, rule_reference, review_guidance,
           timestamp_source, clock_tolerance_milliseconds, evaluated_shot_at, fired_at, received_at,
           observed_at, decisive_boundary_id, detected_at
         ) VALUES (
           @id, @competitionId, @laneId, @sessionId, @shotId, @observationId,
           @shotMode, @policyRuleId, @kind, @ruleReference, @reviewGuidance,
           @timestampSource, @clockToleranceMilliseconds, @evaluatedShotAt, @firedAt, @receivedAt,
           @observedAt, @decisiveBoundaryId, @detectedAt
         )
         ON CONFLICT (competition_id, lane_id, session_id, shot_id, policy_rule_id) DO NOTHING`,
      )
      .run({
        ...violation,
        evaluatedShotAt: violation.evaluatedShotAt.toISOString(),
        firedAt: violation.firedAt.toISOString(),
        receivedAt: violation.receivedAt.toISOString(),
        observedAt: violation.observedAt.toISOString(),
        detectedAt: violation.detectedAt.toISOString(),
      });
    return result.changes === 1;
  }

  findViolationsByCompetition(competitionId: string): FiringWindowViolation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM mqtt_firing_window_violations
         WHERE competition_id = ?
         ORDER BY evaluated_shot_at, detected_at, id`,
      )
      .all(competitionId) as FiringWindowViolationRow[];
    return rows.map(toViolation);
  }
}

function toBoundary(row: FiringCommandBoundaryRow): FiringCommandBoundary {
  return {
    id: row.id,
    competitionId: row.competition_id,
    phase: row.phase,
    transition: row.transition,
    occurredAt: new Date(row.occurred_at),
    commandId: row.command_id,
    commandIssuedAt: new Date(row.command_issued_at),
    sourceAction: row.source_action,
    recordedAt: new Date(row.recorded_at),
  };
}

function toViolation(row: FiringWindowViolationRow): FiringWindowViolation {
  return {
    id: row.id,
    competitionId: row.competition_id,
    laneId: row.lane_id,
    sessionId: row.session_id,
    shotId: row.shot_id,
    observationId: row.observation_id,
    shotMode: row.shot_mode,
    policyRuleId: row.policy_rule_id,
    kind: row.kind,
    ruleReference: row.rule_reference,
    reviewGuidance: row.review_guidance,
    timestampSource: row.timestamp_source,
    clockToleranceMilliseconds: row.clock_tolerance_milliseconds,
    evaluatedShotAt: new Date(row.evaluated_shot_at),
    firedAt: new Date(row.fired_at),
    receivedAt: new Date(row.received_at),
    observedAt: new Date(row.observed_at),
    decisiveBoundaryId: row.decisive_boundary_id,
    detectedAt: new Date(row.detected_at),
  };
}
