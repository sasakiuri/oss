// SPDX-License-Identifier: MIT

export interface VistaSourceRow {
  id: string;
  source_json: string;
  snapshot_json: string | null;
  revision: number;
}

export interface VistaParticipantRecord {
  id: string;
  event_id: string;
  player_name: string;
  affiliation: string;
  entry_status: string;
}

export interface VistaLinkedResult {
  id: string;
  participant_id: string;
  source_competition_id: string | null;
  source_lane_id: string | null;
  relay_number: number;
}

/** Saved Vista subjects and the Director records a Vista snapshot reads. */
export interface IVistaSourceStore {
  /** Runs the operation in one database transaction. */
  transaction(operation: () => void): void;
  rows(): VistaSourceRow[];
  row(id: string): VistaSourceRow | null;
  saveSource(id: string, sourceJson: string): void;
  /** Inserts the subject or replaces its saved source, keeping a saved snapshot. */
  upsertSource(id: string, sourceJson: string): void;
  saveSnapshot(id: string, snapshotJson: string, revision: number): void;
  participant(id: string): VistaParticipantRecord | null;
  eventLabels(eventId: string): { name: string; championship: string } | undefined;
  /** The relay of a result the competition produced for the event, if any. */
  resultRelay(eventId: string, competitionId: string): { relay_number: number } | undefined;
  eventType(eventId: string): { event_type: string } | undefined;
  /** Final results for a Final event, qualification results otherwise. */
  resultLinks(eventId: string, final: boolean): VistaLinkedResult[];
  /** Changes on the connection so far; a different value means a write happened in between. */
  changeCount(): number;
  /** The latest acknowledged reserve transfer activation. */
  transferRevision(): number;
}
