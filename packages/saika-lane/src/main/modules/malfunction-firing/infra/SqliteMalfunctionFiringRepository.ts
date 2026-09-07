import { canonicalJson } from '@sasakiuri/saika-rules';
import type Database from 'better-sqlite3';

import type {
  IMalfunctionFiringRepository,
  MalfunctionFiringRequest,
  MalfunctionFiringRun,
  MalfunctionFiringShot,
  MalfunctionFiringStart,
} from '../domain/MalfunctionFiring';

export class SqliteMalfunctionFiringRepository implements IMalfunctionFiringRepository {
  constructor(private readonly db: Database.Database) {}
  appendStart(start: MalfunctionFiringStart): void {
    this.db
      .prepare('INSERT INTO malfunction_firing_runs (id, authorization_id, start_json) VALUES (?, ?, ?)')
      .run(start.request.runId, start.request.authorizationId, JSON.stringify(start));
  }
  appendCancelledRequest(request: MalfunctionFiringRequest, reason: string): void {
    this.db.transaction(() => {
      this.db
        .prepare('INSERT INTO malfunction_firing_runs (id, authorization_id, start_json) VALUES (?, ?, ?)')
        .run(
          request.runId,
          request.authorizationId,
          JSON.stringify({ request, plan: null, targetProfileId: null, startedAt: null }),
        );
      this.finish(request.runId, 'CANCELLED', reason);
    })();
  }
  appendShot(runId: string, shot: MalfunctionFiringShot): void {
    const existing = this.db
      .prepare('SELECT run_id, payload FROM malfunction_firing_shots WHERE shot_id = ?')
      .get(shot.shotId) as { run_id: string; payload: string } | undefined;
    if (existing) {
      if (existing.run_id !== runId || canonicalJson(JSON.parse(existing.payload)) !== canonicalJson(shot))
        throw new Error('Shot ID has conflicting evidence');
      return;
    }
    this.db
      .prepare('INSERT INTO malfunction_firing_shots (run_id, shot_id, observation_id, payload) VALUES (?, ?, ?, ?)')
      .run(runId, shot.shotId, shot.observationId, JSON.stringify(shot));
  }
  finish(runId: string, status: 'COMPLETED' | 'CANCELLED', reason: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO malfunction_firing_terminals (run_id, status, reason) VALUES (?, ?, ?)')
      .run(runId, status, reason);
  }
  find(runId: string): MalfunctionFiringRun | null {
    const row = this.db.prepare('SELECT start_json FROM malfunction_firing_runs WHERE id = ?').get(runId) as
      { start_json: string } | undefined;
    if (!row) return null;
    const terminal = this.db
      .prepare('SELECT status, reason FROM malfunction_firing_terminals WHERE run_id = ?')
      .get(runId) as { status: 'COMPLETED' | 'CANCELLED'; reason: string } | undefined;
    const shots = this.db
      .prepare('SELECT payload FROM malfunction_firing_shots WHERE run_id = ? ORDER BY rowid')
      .all(runId) as { payload: string }[];
    return {
      ...(JSON.parse(row.start_json) as MalfunctionFiringStart),
      status: terminal?.status ?? 'RUNNING',
      captureIssues: [],
      terminalReason: terminal?.reason ?? null,
      shots: shots.map((shot) => JSON.parse(shot.payload) as MalfunctionFiringShot),
    };
  }
  active(): MalfunctionFiringRun | null {
    const row = this.db
      .prepare(
        'SELECT id FROM malfunction_firing_runs WHERE id NOT IN (SELECT run_id FROM malfunction_firing_terminals) ORDER BY rowid DESC LIMIT 1',
      )
      .get() as { id: string } | undefined;
    return row ? this.find(row.id) : null;
  }
}
