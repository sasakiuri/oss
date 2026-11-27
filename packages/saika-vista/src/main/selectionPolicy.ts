// SPDX-License-Identifier: MIT
import type { VistaCatalog, VistaIdentity } from '@sasakiuri/saika-protocol/Vista';

import { findEntry, sameSubject, type ScreenConfig, type SnapshotEntry, type SubjectRef } from '../shared/model';

/** Subjects a screen can resume from standby: those with current data or a finished result. */
export function resumableSubjects(entries: SnapshotEntry[]): SubjectRef[] {
  return entries
    .filter((entry) => entry.state === 'live' || entry.snapshot.finished)
    .map(({ snapshot }) => ({ sourceId: snapshot.sourceId, subjectId: snapshot.subjectId }));
}

/** Whether any of the selections is one of the subjects. */
export function selectsAny(selections: SubjectRef[], subjects: SubjectRef[]): boolean {
  return selections.some((selection) => subjects.some((subject) => sameSubject(subject, selection)));
}

/** What this PC knows when a screen configuration is applied. */
export interface SelectionContext {
  /** The saved configuration of the screen, if it exists. */
  previous: ScreenConfig | undefined;
  /** Connected sources with their most recently received catalog. */
  sources: Array<{ id: string; catalog: VistaCatalog }>;
  /** The identity of every source this PC has connected. */
  sourceIdentities: VistaIdentity[];
  /** The snapshots this PC holds. */
  entries: SnapshotEntry[];
}

/** Rejects a configuration whose views and subjects the selected sources do not support. */
export function assertSelectable(
  config: ScreenConfig,
  { previous, sources, sourceIdentities, entries }: SelectionContext,
): void {
  // A display can retain an authorized selection without retaining the controller's source connections.
  const preservesSubjects =
    previous?.view === config.view &&
    previous.selections.length === config.selections.length &&
    config.selections.every((selection, index) => {
      const saved = previous.selections[index]!;
      return sameSubject(selection, saved) && selection.follow === saved.follow;
    });
  const kindOf = (id?: string) =>
    sources.find((source) => source.id === id)?.catalog.identity.kind ??
    sourceIdentities.find((identity) => identity.sourceId === id)?.kind;
  const permitsDirectorSelection = (id?: string) =>
    kindOf(id) === 'director' || (kindOf(id) === undefined && preservesSubjects);
  if (config.view === 'ranking' || config.view === 'final') {
    if (config.selections.length !== 1 || !permitsDirectorSelection(config.selections[0]?.sourceId))
      throw new Error('Rankings and final summaries require one Director subject');
  }
  for (const selection of config.selections) {
    const source = sources.find((candidate) => candidate.id === selection.sourceId);
    const saved = findEntry(entries, selection) !== undefined;
    if (!source && !saved && !preservesSubjects) throw new Error('Connect the selected source first');
    if (selection.follow === 'athlete' && !permitsDirectorSelection(selection.sourceId))
      throw new Error('Athlete tracking requires Director');
    const subject = source?.catalog.subjects.find((candidate) => candidate.id === selection.subjectId);
    // Saved subjects remain selectable while the source no longer advertises them.
    if ((!subject || subject.availability !== 'available') && !saved && !preservesSubjects)
      throw new Error(subject?.reason ?? 'The selected subject is unavailable');
  }
}

/**
 * Whether the configuration resumes a screen from standby although this PC has no current data or
 * finished result for any selected subject. Only the display PC's own saved results can then permit it.
 */
export function resumesWithoutLocalData(
  config: ScreenConfig,
  previous: ScreenConfig | undefined,
  entries: SnapshotEntry[],
): boolean {
  return (
    !!previous?.standby &&
    !config.standby &&
    config.selections.length > 0 &&
    !selectsAny(config.selections, resumableSubjects(entries))
  );
}
