// SPDX-License-Identifier: MIT
import { defineModule } from '@/main/shared-infra/module/ModuleDefinition';
import { backupCaptureReadinessContract } from '@/shared/ipc/contracts';

/** The capture plans and their events, from which the selectable backup sources are listed. */
export interface BackupCaptureSourceReaders {
  readonly plans: { list(): readonly { readonly eventId: string; readonly sourceLabel: string }[] };
  readonly events: { findById(eventId: string): { readonly name: string } | null };
}

export const backupCaptureReadinessModule = defineModule({
  name: 'backupCaptureReadiness',
  deps: ['ipcRouter', 'backupCaptureReadinessService', 'backupCaptureSources'],
  register({ ipcRouter, backupCaptureReadinessService: service, backupCaptureSources: { plans, events } }) {
    ipcRouter.register(backupCaptureReadinessContract, {
      get: async ({ competitionId }) => service.get(competitionId),
      save: async (input) => service.save(input),
      // A capture plan whose event no longer exists is not offered as a source.
      sources: async () =>
        plans.list().flatMap((plan) => {
          const event = events.findById(plan.eventId);
          return event ? [{ eventId: plan.eventId, label: `${event.name} · ${plan.sourceLabel}` }] : [];
        }),
    });
  },
});
