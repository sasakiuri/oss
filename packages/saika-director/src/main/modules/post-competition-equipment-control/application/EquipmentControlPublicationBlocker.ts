import type { IResultPublicationBlocker } from '@/main/modules/result-publication';

import type { EquipmentControlCheckStatus } from '../domain/PostCompetitionEquipmentCheck';

export interface EquipmentControlPublicationItem {
  readonly checkId: string;
  readonly athleteName: string;
  readonly status: EquipmentControlCheckStatus;
  /** The current athlete link must identify the subject of the recorded adjudication. */
  readonly disposition: 'UNRESOLVED' | 'DISQUALIFIED' | 'REVOKED';
}

/** Consumer-owned read port; inspection, adjudication and result storage remain independent. */
export interface IEquipmentControlPublicationSource {
  load(eventId: string): readonly EquipmentControlPublicationItem[];
}

export class EquipmentControlPublicationBlocker implements IResultPublicationBlocker {
  constructor(private readonly source: IEquipmentControlPublicationSource) {}

  getIssues(eventId: string): readonly string[] {
    return this.source.load(eventId).flatMap((item) => {
      if (item.status === 'PASSED' || item.status === 'VOIDED') return [];
      const confirmed = item.status === 'FAILED_CONFIRMED' || item.status === 'DID_NOT_REPORT_CONFIRMED';
      if (confirmed && item.disposition !== 'UNRESOLVED') return [];
      const action = confirmed
        ? `Record the Jury sanction for this athlete and event using authority reference EQUIPMENT-CONTROL:${item.checkId}.`
        : 'Complete the equipment check and any required Jury confirmation.';
      return [`Equipment check ${item.checkId}: ${item.athleteName} (${item.status}). ${action}`];
    });
  }
}
