import type Database from 'better-sqlite3';

import {
  BackupCaptureReadinessSettingsSchema,
  type BackupCaptureReadinessSettings,
} from '@/shared/ipc/contracts/backupCaptureReadiness.contract';

import type { IBackupCaptureReadinessSettingsRepository } from './BackupCaptureReadinessService';

export class SqliteBackupCaptureReadinessSettingsRepository implements IBackupCaptureReadinessSettingsRepository {
  constructor(private readonly db: Database.Database) {}
  find(competitionId: string): BackupCaptureReadinessSettings | null {
    const row = this.db
      .prepare('SELECT settings_json FROM backup_capture_readiness_settings WHERE competition_id = ?')
      .get(competitionId) as { settings_json: string } | undefined;
    if (!row) return null;
    const value = BackupCaptureReadinessSettingsSchema.parse(JSON.parse(row.settings_json));
    if (value.competitionId !== competitionId) throw new Error('Backup readiness settings identity does not match');
    return value;
  }
  save(settings: BackupCaptureReadinessSettings): void {
    const validated = BackupCaptureReadinessSettingsSchema.parse(settings);
    this.db
      .prepare(
        `INSERT INTO backup_capture_readiness_settings (competition_id, settings_json) VALUES (?, ?)
      ON CONFLICT(competition_id) DO UPDATE SET settings_json = excluded.settings_json`,
      )
      .run(validated.competitionId, JSON.stringify(validated));
  }
}
