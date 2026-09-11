// SPDX-License-Identifier: MIT
import type { VistaDefinition, VistaParticipant, VistaSnapshot } from '@sasakiuri/saika-protocol/Vista';

import type { ScreenConfig, Selection, SnapshotEntry } from '../shared/model';

export const stateLabel: Record<SnapshotEntry['state'], string> = {
  live: 'Live',
  saved: 'Saved display · awaiting confirmation',
  stale: 'Updates paused',
  missing: 'Waiting for data',
  unsupported: 'Display unavailable',
  syncing: 'Synchronizing',
};
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
    entries.some(
      ({ snapshot }) =>
        snapshot.sourceId === selected?.sourceId &&
        snapshot.subjectId === selected?.subjectId &&
        snapshot.ranking?.kind === 'competition',
    )
  );
}
export function selectedSlots(config: ScreenConfig, entries: SnapshotEntry[]): DisplaySlot[] {
  return config.selections.flatMap((selection, index) => {
    const entry = entries.find(
      ({ snapshot }) => snapshot.sourceId === selection.sourceId && snapshot.subjectId === selection.subjectId,
    );
    const participants = entry?.snapshot.participants ?? [];
    const keys = selection.participantIds.length
      ? selection.participantIds
      : participants.map((p) => (selection.follow === 'lane' ? p.laneId : p.id));
    if (!keys.length) return [{ key: `${index}:waiting`, selection, entry }];
    return keys.map((id) => ({
      key: `${index}:${id}`,
      selection,
      entry,
      requestedId: id,
      participant: participants.find((p) => (selection.follow === 'lane' ? p.laneId === id : p.id === id)),
    }));
  });
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
