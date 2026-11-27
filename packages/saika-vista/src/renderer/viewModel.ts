// SPDX-License-Identifier: MIT
import type { VistaDefinition, VistaParticipant, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';

import {
  findEntry,
  sameSubject,
  type AppState,
  type ScreenConfig,
  type ScreenStatus,
  type Selection,
  type SnapshotEntry,
} from '../shared/model';

export const stateLabel: Record<SnapshotEntry['state'], string> = {
  live: 'Live',
  saved: 'Saved display · awaiting confirmation',
  stale: 'Updates paused',
  missing: 'Waiting for data',
  unsupported: 'Display unavailable',
  syncing: 'Synchronizing',
};
export const VIEW_LABEL: Record<ScreenConfig['view'], string> = {
  targets: 'Target grid',
  focus: 'Athlete focus',
  ranking: 'Ranking',
  final: 'Final',
};
/** Whether the audience window shows the requested revision on a connected monitor. */
export function displayConfirmed(status: ScreenStatus): boolean {
  return status.renderAlive && status.monitorAvailable && status.renderedRevision === status.config.revision;
}
/** The entry as shown at `now`: live data received over five seconds ago, or in the future, is stale. */
export function displayedEntry(entry: SnapshotEntry, now: number): SnapshotEntry {
  return entry.state === 'live' && (now - entry.receivedAt > 5000 || now < entry.receivedAt)
    ? { ...entry, state: 'stale' }
    : entry;
}
/** The ID by which a selection follows a participant: its lane, or the athlete across lane changes. */
export function participantKey(follow: Selection['follow'], participant: VistaParticipant): string {
  return follow === 'lane' ? participant.laneId : participant.id;
}
export function scoreText(score: number | null | undefined, definition?: VistaDefinition): string {
  if (score === null || score === undefined) return '—';
  return definition?.scoring === 'DECIMAL' ? score.toFixed(1) : String(score);
}
export type DisplaySlot = {
  key: string;
  selection: Selection;
  entry?: SnapshotEntry;
  participant?: VistaParticipant;
  requestedId?: string;
};
export function usesRankingRows(config: ScreenConfig, entries: SnapshotEntry[]): boolean {
  if (config.view === 'ranking') return true;
  const selected = config.selections[0];
  return (
    config.view === 'final' &&
    !!selected &&
    entries.some(({ snapshot }) => sameSubject(snapshot, selected) && snapshot.ranking?.kind === 'competition')
  );
}
export function selectedSlots(config: ScreenConfig, entries: SnapshotEntry[]): DisplaySlot[] {
  return config.selections.flatMap((selection, index) => {
    const entry = findEntry(entries, selection);
    const participants = entry?.snapshot.participants ?? [];
    const keys = selection.participantIds.length
      ? selection.participantIds
      : participants.map((p) => participantKey(selection.follow, p));
    if (!keys.length) return [{ key: `${index}:waiting`, selection, entry }];
    return keys.map((id) => ({
      key: `${index}:${id}`,
      selection,
      entry,
      requestedId: id,
      participant: participants.find((p) => participantKey(selection.follow, p) === id),
    }));
  });
}
/** What the screen editor can tell about a draft from the sources and snapshots on this PC. */
export function editorSummary(
  draft: ScreenConfig,
  /** The saved configuration the draft edits, or undefined for a new screen. */
  saved: ScreenConfig | undefined,
  state: AppState,
): {
  rankView: boolean;
  rankAllowed: boolean;
  valid: boolean;
  resultRows: boolean;
  /** The selected positions or result rows, or null when this PC cannot count them. */
  count: number | null;
  pages: number | null;
} {
  const rankView = draft.view === 'ranking' || draft.view === 'final';
  const only = draft.selections.length === 1 ? draft.selections[0] : undefined;
  const savedFirst = saved?.selections[0];
  const rankAllowed =
    !!only &&
    (state.sources.find((s) => s.id === only.sourceId)?.catalog.identity.kind === 'director' ||
      state.snapshots.some((entry) => sameSubject(entry.snapshot, only) && entry.snapshot.ranking !== null) ||
      (saved?.view === draft.view &&
        !!savedFirst &&
        sameSubject(only, savedFirst) &&
        only.follow === savedFirst.follow));
  const valid =
    draft.name.trim().length > 0 &&
    draft.monitorId.length > 0 &&
    draft.selections.every((s) => s.sourceId && s.subjectId) &&
    (!rankView || rankAllowed);
  const first = draft.selections[0];
  const selectedEntry = first && findEntry(state.snapshots, first);
  const resultRows = usesRankingRows(draft, state.snapshots);
  const count = resultRows
    ? (selectedEntry?.snapshot.ranking?.rows.length ?? null)
    : draft.view === 'final' && !selectedEntry
      ? null
      : draft.selections.some((selection) => !selection.participantIds.length && !findEntry(state.snapshots, selection))
        ? null
        : selectedSlots(draft, state.snapshots).length;
  const pages = count === null ? null : Math.max(1, Math.ceil(count / (draft.view === 'focus' ? 1 : draft.slots)));
  return { rankView, rankAllowed, valid, resultRows, count, pages };
}
export function filteredShots(participant: VistaParticipant, config: ScreenConfig): VistaParticipant['shots'] {
  const shots = participant.shots
    .filter((shot) => shot.mode === participant.mode)
    .sort((a, b) => a.sequence - b.sequence);
  if (config.shotFilter === 'series')
    return shots.filter(
      (shot) =>
        shot.stage === participant.currentStage &&
        shot.series === participant.currentSeries &&
        shot.mode === participant.mode,
    );
  if (config.shotFilter === 'recent') return shots.slice(-config.recentShots);
  return shots;
}
export function pageAt(
  config: ScreenConfig,
  total: number,
  elapsedMs: number,
): { page: number; pages: number; start: number; slots: number } {
  const slots = config.view === 'focus' ? 1 : Math.max(1, config.slots);
  const pages = Math.max(1, Math.ceil(total / slots));
  const advances = config.autoRotate ? Math.floor(Math.max(0, elapsedMs) / (config.pageSeconds * 1000)) : 0;
  const page = (config.page + advances) % pages;
  return { page, pages, start: page * slots, slots };
}
export function clockDisplay(
  clock: VistaParticipant['clock'],
  entry: SnapshotEntry,
  now: number,
): { value: string; label: string; confirmed: boolean } | null {
  if (!clock) return null;
  const localElapsed = now - entry.receivedAt;
  const sourceElapsed = entry.snapshot.capturedAt - clock.sampledAt;
  const fresh =
    entry.state === 'live' &&
    localElapsed >= 0 &&
    localElapsed <= 5000 &&
    sourceElapsed >= 0 &&
    Math.abs(entry.snapshot.capturedAt - entry.receivedAt) <= 3000;
  const confirmed = fresh && clock.state === 'running';
  const remaining = confirmed ? Math.max(0, clock.remainingMs - sourceElapsed - localElapsed) : clock.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  return {
    value: `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    label: !fresh
      ? 'Clock unconfirmed'
      : clock.state === 'running'
        ? remaining === 0
          ? 'Awaiting time confirmation'
          : clock.label || 'Running'
        : clock.state === 'expired'
          ? 'Time expired'
          : clock.label || 'Stopped',
    confirmed,
  };
}
export function publicationLabel(entry: SnapshotEntry): string {
  const ranking = entry.snapshot.ranking;
  if (!ranking) return 'Ranking unavailable';
  if (entry.state !== 'live') return `${stateLabel[entry.state]} · publication unconfirmed`;
  if (
    ranking.kind !== 'competition' &&
    entry.snapshot.participants.some((participant) => participant.dataState === 'stale' || !participant.historyComplete)
  )
    return `${ranking.kind === 'live' ? 'Live' : 'Reference'} standings · partial data · publication unconfirmed`;
  const names: Record<NonNullable<VistaSnapshot['ranking']>['state'], string> = {
    DRAFT: 'Draft',
    PRELIMINARY: 'Preliminary',
    PROTEST_PENDING: 'Protest pending',
    PROTEST_CLOSED: 'Protest closed',
    OFFICIAL: 'Official',
    FINAL: 'Final',
    REVIEW_REQUIRED: 'Review required',
    UNVERIFIED: 'Unverified',
  };
  return `${ranking.kind === 'competition' ? 'Competition ranking' : ranking.kind === 'live' ? 'Live standings' : 'Reference standings'} · ${names[ranking.state]}`;
}
export function defaultConfig(monitorId: string, name: string): ScreenConfig {
  return {
    id: crypto.randomUUID(),
    monitorId,
    name,
    revision: 1,
    view: 'targets',
    selections: [],
    standby: true,
    slots: 4,
    autoRotate: false,
    pageSeconds: 10,
    page: 0,
    zoom: 1,
    shotFilter: 'all',
    recentShots: 10,
    autoStart: false,
  };
}
