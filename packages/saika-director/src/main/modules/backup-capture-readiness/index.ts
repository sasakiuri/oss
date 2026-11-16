import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { backupCaptureReadinessContract } from '@/shared/ipc/contracts';

import type { BackupCaptureReadinessService } from './BackupCaptureReadinessService';

export { BackupCaptureReadinessService } from './BackupCaptureReadinessService';
export { SqliteBackupCaptureReadinessSettingsRepository } from './SqliteBackupCaptureReadinessSettingsRepository';

/** The capture plans and their events, from which the selectable backup sources are listed. */
export interface BackupCaptureSourceReaders {
  readonly plans: { list(): readonly { readonly eventId: string; readonly sourceLabel: string }[] };
  readonly events: { findById(eventId: string): { readonly name: string } | null };
}

/** A capture plan whose event no longer exists is not offered as a source. */
export function registerBackupCaptureReadiness(
  router: IpcRouter,
  service: Pick<BackupCaptureReadinessService, 'get' | 'save'>,
  { plans, events }: BackupCaptureSourceReaders,
) {
  router.register(backupCaptureReadinessContract, {
    get: async ({ competitionId }) => service.get(competitionId),
    save: async (input) => service.save(input),
    sources: async () =>
      plans.list().flatMap((plan) => {
        const event = events.findById(plan.eventId);
        return event ? [{ eventId: plan.eventId, label: `${event.name} · ${plan.sourceLabel}` }] : [];
      }),
  });
}
