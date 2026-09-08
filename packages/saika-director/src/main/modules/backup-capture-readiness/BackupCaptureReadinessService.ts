import { createHash } from 'node:crypto';

import type {
  CompetitionStartIssue,
  CompetitionStartScope,
  ICompetitionStartReadinessSource,
} from '@/main/shared-infra/operations/CompetitionStartReadiness';
import {
  BackupCaptureReadinessSettingsSchema,
  type BackupCaptureReadinessDto,
  type BackupCaptureReadinessSettings,
} from '@/shared/ipc/contracts/backupCaptureReadiness.contract';

import {
  BackupCaptureHealthPolicy,
  type BackupCaptureHealthFacts,
  type IBackupCaptureHealthPolicy,
} from './BackupCaptureHealthPolicy';

export interface IBackupCaptureReadinessSettingsRepository {
  find(competitionId: string): BackupCaptureReadinessSettings | null;
  save(settings: BackupCaptureReadinessSettings): void;
}

/** Optional start checks consume capture facts without controlling acquisition, scoring or publication. */
export class BackupCaptureReadinessService implements ICompetitionStartReadinessSource {
  constructor(
    private readonly repository: IBackupCaptureReadinessSettingsRepository,
    private readonly readFacts: (eventId: string) => BackupCaptureHealthFacts,
    private readonly eventExists: (eventId: string) => boolean,
    private readonly policy: IBackupCaptureHealthPolicy = new BackupCaptureHealthPolicy(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(competitionId: string): BackupCaptureReadinessDto {
    const settings: BackupCaptureReadinessSettings = this.repository.find(competitionId) ?? {
      competitionId,
      eventId: null,
      mode: 'DISABLED',
      maximumAgeMilliseconds: 15_000,
    };
    const revision = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
    if (settings.mode === 'DISABLED') return { settings, revision, health: { state: 'DISABLED', issues: [] } };
    if (!settings.eventId || !this.eventExists(settings.eventId))
      return {
        settings,
        revision,
        health: { state: 'UNBOUND', issues: ['Select an existing event with an independent backup capture source'] },
      };
    try {
      const health = this.policy.assess(this.readFacts(settings.eventId), settings.maximumAgeMilliseconds, this.now());
      return { settings, revision, health: { ...health, issues: [...health.issues] } };
    } catch (error) {
      return {
        settings,
        revision,
        health: {
          state: 'ERROR',
          issues: [error instanceof Error ? error.message : 'Unable to read backup capture status'],
        },
      };
    }
  }

  save(input: BackupCaptureReadinessSettings & { expectedRevision: string }): BackupCaptureReadinessDto {
    const settings = BackupCaptureReadinessSettingsSchema.parse(input);
    if (input.expectedRevision !== this.get(input.competitionId).revision)
      throw new Error('Backup capture settings changed; reload before saving');
    if (settings.eventId && !this.eventExists(settings.eventId)) throw new Error('The selected event no longer exists');
    this.repository.save(settings);
    return this.get(input.competitionId);
  }

  getStartIssues(scope: CompetitionStartScope): readonly CompetitionStartIssue[] {
    const current = this.get(scope.competitionId);
    return current.health.issues.map((message) => ({
      code: 'BACKUP_CAPTURE_HEALTH',
      message,
      blocking: current.settings.mode === 'REQUIRED',
    }));
  }
}
