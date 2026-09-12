// SPDX-License-Identifier: MIT
import type { Migration } from './Migration';

export const migration021: Migration = {
  version: 21,
  name: 'shot_competition_context',
  up(db) {
    const columns = db.prepare('PRAGMA table_info(shots)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'competitionContext')) {
      db.exec('ALTER TABLE shots ADD COLUMN competitionContext TEXT');
    }

    // Recover only exact recorded observation links. Session group sizes cannot
    // establish competition coordinates after an incomplete or timed series.
    const rows = db
      .prepare(
        `
      SELECT shots.id, shots.sessionId, evidence.payload_json
      FROM shots
      JOIN shot_observation_evidence_outbox AS evidence ON evidence.observation_id = shots.observationId
      WHERE shots.competitionContext IS NULL
    `,
      )
      .all() as { id: string; sessionId: string; payload_json: string }[];
    const contexts = new Map<string, Set<string>>();
    for (const row of rows) {
      const evidence = JSON.parse(row.payload_json) as { outcome?: string; sessionId?: string; competition?: unknown };
      if (evidence.outcome !== 'RECORDED' || evidence.sessionId !== row.sessionId || evidence.competition == null)
        continue;
      const context = serializeContext(evidence.competition);
      const candidates = contexts.get(row.id) ?? new Set<string>();
      candidates.add(context);
      contexts.set(row.id, candidates);
    }
    const adjudications = db
      .prepare(
        `
      SELECT shots.id, adjudication.competition_id, adjudication.stage_index, adjudication.series_index
      FROM shots
      JOIN qualification_recovery_adjudication_shots AS evidence ON evidence.shot_id = shots.id
      JOIN qualification_recovery_adjudications AS adjudication ON adjudication.id = evidence.adjudication_id
      WHERE shots.competitionContext IS NULL AND shots.sessionId = adjudication.session_id
    `,
      )
      .all() as { id: string; competition_id: string; stage_index: number; series_index: number }[];
    for (const row of adjudications) {
      const context = serializeContext({
        competitionId: row.competition_id,
        stageIndex: row.stage_index,
        seriesIndex: row.series_index,
      });
      const candidates = contexts.get(row.id) ?? new Set<string>();
      candidates.add(context);
      contexts.set(row.id, candidates);
    }
    const update = db.prepare('UPDATE shots SET competitionContext = ? WHERE id = ?');
    for (const [id, candidates] of contexts) {
      if (candidates.size === 1) update.run([...candidates][0], id);
    }
  },
};

// Keep the historical upgrade independent of future application validation.
function serializeContext(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid shot competition evidence');
  const context = value as Record<string, unknown>;
  if (
    typeof context.competitionId !== 'string' ||
    context.competitionId.length === 0 ||
    !Number.isInteger(context.stageIndex) ||
    (context.stageIndex as number) < 0 ||
    !Number.isInteger(context.seriesIndex) ||
    (context.seriesIndex as number) < 0
  )
    throw new Error('Invalid shot competition evidence');
  return JSON.stringify({
    competitionId: context.competitionId,
    stageIndex: context.stageIndex,
    seriesIndex: context.seriesIndex,
  });
}
