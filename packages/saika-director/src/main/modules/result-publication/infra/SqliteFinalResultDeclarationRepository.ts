import type Database from 'better-sqlite3';

import { FinalResultDeclaration } from '../domain/FinalResultDeclaration';
import type { IFinalResultDeclarationRepository } from '../domain/IFinalResultDeclarationRepository';

interface Row {
  id: string;
  event_id: string;
  snapshot_revision: string;
  approval_id: string;
  final_protests_resolved: number;
  result_process_confirmed: number;
  statement: string;
  official_name: string;
  rule_reference: string;
  declared_at: string;
}

export class SqliteFinalResultDeclarationRepository implements IFinalResultDeclarationRepository {
  constructor(private readonly db: Database.Database) {}

  append(declaration: FinalResultDeclaration): void {
    this.db
      .prepare(
        `INSERT INTO final_result_declarations (
           id, event_id, snapshot_revision, approval_id, final_protests_resolved,
           result_process_confirmed, statement, official_name, rule_reference, declared_at
         ) VALUES (
           @id, @eventId, @snapshotRevision, @approvalId, @finalProtestsResolved,
           @resultProcessConfirmed, @statement, @officialName, @ruleReference, @declaredAt
         )`,
      )
      .run({
        id: declaration.id,
        eventId: declaration.eventId,
        snapshotRevision: declaration.snapshotRevision,
        approvalId: declaration.approvalId,
        finalProtestsResolved: Number(declaration.finalProtestsResolved),
        resultProcessConfirmed: Number(declaration.resultProcessConfirmed),
        statement: declaration.statement,
        officialName: declaration.officialName,
        ruleReference: declaration.ruleReference,
        declaredAt: declaration.declaredAt.toISOString(),
      });
  }

  findByEvent(eventId: string): FinalResultDeclaration | null {
    const row = this.db.prepare('SELECT * FROM final_result_declarations WHERE event_id = ?').get(eventId) as
      Row | undefined;
    return row
      ? FinalResultDeclaration.reconstruct({
          id: row.id,
          eventId: row.event_id,
          snapshotRevision: row.snapshot_revision,
          approvalId: row.approval_id,
          finalProtestsResolved: row.final_protests_resolved === 1,
          resultProcessConfirmed: row.result_process_confirmed === 1,
          statement: row.statement,
          officialName: row.official_name,
          ruleReference: row.rule_reference,
          declaredAt: new Date(row.declared_at),
        })
      : null;
  }
}
