import type Database from 'better-sqlite3';
import type { OperatorAuditEntry } from '@/shared/ipc/contracts/operatorAccess.contract';
import type { IOperatorAccessStore, StoredOperatorAccount } from './OperatorAccessService';

export class SqliteOperatorAccessStore implements IOperatorAccessStore {
  constructor(private readonly database: Database.Database) {}
  enabled() {
    return (
      (this.database.prepare('SELECT enabled FROM operator_access_settings WHERE id = 1').get() as { enabled: number })
        .enabled === 1
    );
  }
  setEnabled(enabled: boolean) {
    this.database.prepare('UPDATE operator_access_settings SET enabled = ? WHERE id = 1').run(enabled ? 1 : 0);
  }
  accounts(): StoredOperatorAccount[] {
    return (
      this.database.prepare('SELECT payload_json FROM operator_accounts ORDER BY id').all() as {
        payload_json: string;
      }[]
    ).map((row) => JSON.parse(row.payload_json) as StoredOperatorAccount);
  }
  saveAccount(account: StoredOperatorAccount) {
    this.database
      .prepare(
        'INSERT INTO operator_accounts (id, payload_json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json',
      )
      .run(account.id, JSON.stringify(account));
  }
  appendAudit(entry: OperatorAuditEntry) {
    this.database
      .prepare('INSERT INTO operator_access_audit (id, payload_json) VALUES (?, ?)')
      .run(entry.id, JSON.stringify(entry));
  }
  audit(): OperatorAuditEntry[] {
    return (
      this.database
        .prepare('SELECT payload_json FROM operator_access_audit ORDER BY sequence DESC LIMIT 100')
        .all() as { payload_json: string }[]
    ).map((row) => JSON.parse(row.payload_json) as OperatorAuditEntry);
  }
}
