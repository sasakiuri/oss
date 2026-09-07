import { canonicalJson } from '@sasakiuri/saika-rules';
import type Database from 'better-sqlite3';

import type { MalfunctionFiringEvidencePayload } from '@/shared/mqtt/MalfunctionFiring';
import type { FinalFiringRecord, IFinalFiringRepository } from './FinalRecoveryFiringService';

export class SqliteFinalFiringRepository implements IFinalFiringRepository {
  constructor(private readonly db: Database.Database) {}
  create(record: FinalFiringRecord): void {
    this.db
      .prepare(
        'INSERT INTO final_recovery_firing_runs (id, case_id, competition_id, lane_id, authorization_id, record_json) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.intent.id,
        record.intent.caseId,
        record.request.competitionId,
        record.intent.laneId,
        record.intent.authorizationId,
        JSON.stringify(record),
      );
  }
  find(id: string): FinalFiringRecord | null {
    const row = this.db.prepare('SELECT record_json FROM final_recovery_firing_runs WHERE id = ?').get(id) as
      { record_json: string } | undefined;
    if (!row) return null;
    const evidence = this.db
      .prepare('SELECT evidence_json FROM final_recovery_firing_evidence WHERE run_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(id) as { evidence_json: string } | undefined;
    return {
      ...(JSON.parse(row.record_json) as FinalFiringRecord),
      evidence: evidence ? (JSON.parse(evidence.evidence_json) as MalfunctionFiringEvidencePayload) : null,
    };
  }
  list(caseId: string): FinalFiringRecord[] {
    return this.db
      .prepare('SELECT id FROM final_recovery_firing_runs WHERE case_id = ? ORDER BY rowid')
      .all(caseId)
      .map((row) => this.find((row as { id: string }).id)!);
  }
  appendEvidence(id: string, evidence: MalfunctionFiringEvidencePayload): void {
    const previous = this.find(id)?.evidence;
    if (canonicalJson(previous) === canonicalJson(evidence)) return;
    if (previous && previous.status !== 'RUNNING' && evidence.status !== previous.status)
      throw new Error('Lane evidence cannot reopen or change a terminal firing status');
    if (previous?.shots.some((shot, index) => canonicalJson(shot) !== canonicalJson(evidence.shots[index])))
      throw new Error('Lane evidence cannot remove or rewrite captured recovery shots');
    this.db
      .prepare(
        'INSERT INTO final_recovery_firing_evidence (id, run_id, received_at, evidence_json) VALUES (?, ?, ?, ?)',
      )
      .run(crypto.randomUUID(), id, new Date().toISOString(), JSON.stringify(evidence));
  }
}
