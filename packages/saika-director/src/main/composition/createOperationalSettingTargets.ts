// SPDX-License-Identifier: MIT
import { booleanOperationalSetting } from '@/main/modules/operational-profiles';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import type { OperatorServices } from './createOperatorServices';
import type { PublicationServices } from './createPublicationServices';

type Dependencies = Pick<ServiceRegistry, 'appConfigService'> &
  Pick<OperatorServices, 'operatorAccessStore' | 'operatorAccessService'> &
  Pick<PublicationServices, 'backupCaptureReadiness'>;

export function createOperationalSettingTargets({
  appConfigService,
  operatorAccessStore,
  operatorAccessService,
  backupCaptureReadiness,
}: Dependencies): ServiceRegistry['operationalSettingTargets'] {
  return [
    {
      id: 'backup-capture',
      label: 'Independent backup capture availability',
      scope: 'COMPETITION',
      read: (competitionId) => {
        const current = backupCaptureReadiness.get(competitionId);
        return { mode: current.settings.mode, context: current.revision };
      },
      write: (competitionId, mode) => {
        const current = backupCaptureReadiness.get(competitionId);
        backupCaptureReadiness.save({ ...current.settings, mode, expectedRevision: current.revision });
      },
    },
    booleanOperationalSetting({
      id: 'publication-observations',
      label: 'Reviewed unscored shots and firing-window evidence before official publication',
      read: () => appConfigService.get('resultPublication.requireObservationReviews'),
      write: (required) => appConfigService.set('resultPublication.requireObservationReviews', required),
    }),
    booleanOperationalSetting({
      id: 'publication-equipment',
      label: 'Completed equipment checks and adjudications before official publication',
      read: () => appConfigService.get('resultPublication.requireEquipmentChecksComplete'),
      write: (required) => appConfigService.set('resultPublication.requireEquipmentChecksComplete', required),
    }),
    booleanOperationalSetting({
      id: 'publication-protests',
      label: 'Completed protest cases before official publication',
      read: () => appConfigService.get('resultPublication.requireProtestCasesComplete'),
      write: (required) => appConfigService.set('resultPublication.requireProtestCasesComplete', required),
    }),
    booleanOperationalSetting({
      id: 'operator-access',
      label: 'Operator authentication',
      read: () => operatorAccessStore.enabled(),
      write: (required) => operatorAccessService.setEnabledForCurrentActor(required),
    }),
    booleanOperationalSetting({
      id: 'publication-incidents',
      label: 'Incident reports before official publication',
      read: () => appConfigService.get('resultPublication.requireIncidentReports'),
      write: (required) => appConfigService.set('resultPublication.requireIncidentReports', required),
    }),
    booleanOperationalSetting({
      id: 'publication-recoveries',
      label: 'Completed final recoveries before official publication',
      read: () => appConfigService.get('resultPublication.requireFinalRecoveriesComplete'),
      write: (required) => appConfigService.set('resultPublication.requireFinalRecoveriesComplete', required),
    }),
  ];
}
