// SPDX-License-Identifier: MIT
import type { ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts';

type ReviewSettingKey = `resultPublication.${keyof ResultPublicationReviewSettingsDto}`;

/** The configuration calls the Director-wide publication review requirements need. */
export interface PublicationReviewSettingsConfig {
  get(key: ReviewSettingKey): boolean;
  setMany(values: Record<ReviewSettingKey, boolean>): void;
}

export function readPublicationReviewSettings(
  config: PublicationReviewSettingsConfig,
): ResultPublicationReviewSettingsDto {
  return {
    requireObservationReviews: config.get('resultPublication.requireObservationReviews'),
    requireIncidentReports: config.get('resultPublication.requireIncidentReports'),
    requireFinalRecoveriesComplete: config.get('resultPublication.requireFinalRecoveriesComplete'),
    requireProtestCasesComplete: config.get('resultPublication.requireProtestCasesComplete'),
    requireEquipmentChecksComplete: config.get('resultPublication.requireEquipmentChecksComplete'),
  };
}

/** Saves all requirements in one configuration write and returns them as stored. */
export function writePublicationReviewSettings(
  config: PublicationReviewSettingsConfig,
  settings: ResultPublicationReviewSettingsDto,
): ResultPublicationReviewSettingsDto {
  config.setMany({
    'resultPublication.requireObservationReviews': settings.requireObservationReviews,
    'resultPublication.requireIncidentReports': settings.requireIncidentReports,
    'resultPublication.requireFinalRecoveriesComplete': settings.requireFinalRecoveriesComplete,
    'resultPublication.requireProtestCasesComplete': settings.requireProtestCasesComplete,
    'resultPublication.requireEquipmentChecksComplete': settings.requireEquipmentChecksComplete,
  });
  return readPublicationReviewSettings(config);
}
