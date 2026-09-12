// SPDX-License-Identifier: MIT
import type { VistaParticipant } from '@sasakiuri/saika-protocol/Vista';
import { useEffect, useState } from 'react';

import appIcon from '../../resources/appIcon.png';
import type { AudienceState, ScreenConfig, SnapshotEntry } from '../shared/model';

import { Target } from './Target';
import {
  clockDisplay,
  filteredShots,
  pageAt,
  publicationLabel,
  scoreText,
  selectedSlots,
  stateLabel,
  usesRankingRows,
} from './viewModel';
import type { DisplaySlot } from './viewModel';

function Clock({ clock, entry, now }: { clock: VistaParticipant['clock']; entry: SnapshotEntry; now: number }) {
  const value = clockDisplay(clock, entry, now);
  return value ? (
    <div className={`audience-clock ${value.confirmed ? 'confirmed' : ''}`}>
      <strong>{value.value}</strong>
      <span>{value.label}</span>
    </div>
  ) : (
    <div className="audience-clock">
      <span>Clock unavailable</span>
    </div>
  );
}
function TargetCard({
  slot,
  config,
  now,
  final,
}: {
  slot: DisplaySlot;
  config: ScreenConfig;
  now: number;
  final: boolean;
}) {
  const { participant: p, entry, selection } = slot;
  if (!p || !entry)
    return (
      <article className="athlete-card empty-athlete">
        <span className="eyebrow">
          {selection.label || (selection.follow === 'lane' ? 'Selected lane' : 'Selected athlete')}
        </span>
        <h2>{selection.label || slot.requestedId || 'Awaiting selection'}</h2>
        <p>{entry ? 'Selected target unavailable' : 'Waiting for source'}</p>
        <span className="muted">Position reserved</span>
      </article>
    );
  const participantEntry: SnapshotEntry =
    entry.state === 'live' && p.dataState !== 'live' ? { ...entry, state: p.dataState } : entry;
  const definition = entry.snapshot.definition;
  const shots = filteredShots(p, config);
  const latest = shots.at(-1);
  // Source series totals describe match fire. Shoot-off iterations and resumed
  // sighting may reuse the same positions without sharing those match totals.
  const series =
    p.mode === 'match' ? p.series.find((s) => s.stage === p.currentStage && s.index === p.currentSeries) : undefined;
  const stageSeries = p.series.filter((s) => s.stage === p.currentStage);
  const stageTotal =
    stageSeries.length && stageSeries.every((s) => s.total !== null)
      ? stageSeries.reduce((sum, s) => sum + (s.total ?? 0), 0)
      : null;
  const rankingRow = final ? entry.snapshot.ranking?.rows.find((r) => r.id === p.id) : undefined;
  return (
    <article className={`athlete-card mode-${p.mode}`}>
      <div className="athlete-heading">
        <div>
          <span className="eyebrow">
            {p.laneName}{' '}
            <span className="mode-label">
              {p.mode === 'sighting' ? 'SIGHTING' : p.mode === 'shoot-off' ? 'SHOOT-OFF' : 'MATCH'}
            </span>
          </span>
          <h2 title={p.name || selection.label || p.laneName}>{p.name || selection.label || p.laneName}</h2>
          <p className="affiliation">{p.affiliation || ' '}</p>
        </div>
        <div className="athlete-total">
          <strong>{scoreText(p.total, definition)}</strong>
          <span>
            {p.total === null ? 'Total' : 'Match total'} · {p.shotCount ?? '—'} {p.shotCount === 1 ? 'shot' : 'shots'}
          </span>
        </div>
      </div>
      <div className="athlete-target">
        <Target definition={definition} shots={shots} zoom={config.zoom} />
        <div className="shot-summary">
          <span className="eyebrow">Latest shot</span>
          <strong>{scoreText(latest?.score, definition)}</strong>
          <span>{latest ? `Shot ${latest.sequence}` : 'No shots'}</span>
          {latest?.corrected && <span className="correction">Corrected</span>}
          {latest && !latest.recorded && <span>Not recorded</span>}
          <Clock clock={p.clock} entry={participantEntry} now={now} />
        </div>
      </div>
      <div className="series-details">
        <div>
          <span>
            {p.mode !== 'match' && 'Match · '}
            {definition.stages[p.currentStage]?.name || `Stage ${p.currentStage + 1}`} sum
          </span>
          <strong>{scoreText(stageTotal, definition)}</strong>
        </div>
        <div>
          <span>
            {p.mode === 'shoot-off' ? 'Shoot-off series' : p.mode === 'sighting' ? 'Sighting series' : 'Series'}{' '}
            {p.currentSeries + 1}
          </span>
          <strong>{scoreText(series?.total, definition)}</strong>
        </div>
        <div>
          <span>State</span>
          <strong>{p.status || '—'}</strong>
        </div>
        {rankingRow && (
          <div>
            <span>Rank</span>
            <strong>
              {rankingRow.rank ?? '—'} {rankingRow.classification}
            </strong>
          </div>
        )}
      </div>
      <div className="shot-strip" aria-label="Recent scores">
        {shots.slice(-10).map((s) => (
          <span
            key={s.id}
            className={`${s.corrected ? 'corrected' : ''} ${!s.recorded ? 'unrecorded' : ''}`}
            title={`Shot ${s.sequence}${s.corrected ? ' · corrected' : ''}${!s.recorded ? ' · not recorded' : ''}`}
          >
            <small>{s.sequence}</small>
            {scoreText(s.score, definition)}
          </span>
        ))}
      </div>
      <div className="athlete-footer">
        <span>{selection.label || entry.snapshot.label}</span>
        <span>
          {stateLabel[participantEntry.state]}
          {!p.historyComplete && ' · Partial history'}
        </span>
      </div>
    </article>
  );
}
function Ranking({
  entries,
  config,
  elapsed,
  now,
}: {
  entries: SnapshotEntry[];
  config: ScreenConfig;
  elapsed: number;
  now: number;
}) {
  const selected = config.selections[0];
  const entry = entries.find(
    (e) => e.snapshot.sourceId === selected?.sourceId && e.snapshot.subjectId === selected?.subjectId,
  );
  if (!entry?.snapshot.ranking)
    return (
      <div className="audience-empty">
        <h2>Waiting for published standings</h2>
        <p>Competition standings are provided by Saika Director.</p>
      </div>
    );
  const { ranking, definition } = entry.snapshot;
  const page = pageAt(config, ranking.rows.length, elapsed);
  return (
    <section className="ranking-panel">
      <div className="ranking-heading">
        <div>
          <span className="eyebrow">{ranking.scope}</span>
          <h2>{entry.snapshot.label}</h2>
          <p className={`publication ${entry.state === 'live' ? '' : 'unconfirmed'}`}>{publicationLabel(entry)}</p>
        </div>
        <Clock clock={ranking.kind === 'competition' ? null : entry.snapshot.clock} entry={entry} now={now} />
      </div>
      <div className="ranking-table-space" style={{ '--ranking-rows': page.slots } as React.CSSProperties}>
        <table className="ranking-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Athlete</th>
              <th>Affiliation</th>
              <th>Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.slice(page.start, page.start + page.slots).map((row) => (
              <tr key={row.id}>
                <td className="rank-number">{row.rank ?? '—'}</td>
                <td className="ranking-name">{row.name}</td>
                <td>{row.affiliation || '—'}</td>
                <td className="ranking-score">{scoreText(row.total, definition)}</td>
                <td>{row.classification || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="page-indicator">
        Page {page.page + 1} / {page.pages}
        {config.autoRotate && ` · ${config.pageSeconds}s per page`}
      </div>
    </section>
  );
}
export function AudienceView({
  state,
  now = Date.now(),
  elapsed = 0,
}: {
  state: AudienceState;
  now?: number;
  elapsed?: number;
}) {
  const { config } = state;
  const entries = state.entries.map((entry) =>
    entry.state === 'live' && (now - entry.receivedAt > 5000 || now < entry.receivedAt)
      ? { ...entry, state: 'stale' as const }
      : entry,
  );
  const slots = selectedSlots(config, entries);
  const page = pageAt(config, slots.length, elapsed);
  const capacity = Math.min(page.slots, slots.length);
  const columns = Math.max(1, Math.ceil(Math.sqrt(capacity)));
  const rows = Math.max(1, Math.ceil(capacity / columns));
  const selectedEntry = entries.find((e) =>
    config.selections.some((s) => s.sourceId === e.snapshot.sourceId && s.subjectId === e.snapshot.subjectId),
  );
  const resultRows = usesRankingRows(config, entries);
  const competitionResults = resultRows && selectedEntry?.snapshot.ranking?.kind === 'competition';
  return (
    <main className={`audience view-${config.view}`}>
      {!config.standby && (
        <header className="audience-header">
          <div className="audience-brand">
            <img className="brand-symbol" src={appIcon} alt="" /> Saika <span>Vista</span>
          </div>
          <div className="audience-event">
            <strong>{selectedEntry?.snapshot.label || config.name}</strong>
            <span>
              {competitionResults
                ? selectedEntry.snapshot.ranking!.scope
                : selectedEntry?.snapshot.phase || 'Waiting for competition'}
            </span>
          </div>
          {selectedEntry && !competitionResults && (
            <Clock clock={selectedEntry.snapshot.clock} entry={selectedEntry} now={now} />
          )}
        </header>
      )}
      {config.standby ? (
        <section className="standby">
          <h1>Standby</h1>
          <p>{config.name}</p>
        </section>
      ) : resultRows ? (
        <Ranking entries={entries} config={config} elapsed={elapsed} now={now} />
      ) : (
        <>
          {config.view === 'final' && (
            <div className="final-publication">
              {selectedEntry ? publicationLabel(selectedEntry) : 'Waiting for standings'}
            </div>
          )}
          {slots.length ? (
            <section
              className="target-grid"
              style={{ '--columns': String(columns), '--rows': String(rows) } as React.CSSProperties}
            >
              {slots.slice(page.start, page.start + page.slots).map((slot) => (
                <TargetCard key={slot.key} slot={slot} config={config} now={now} final={config.view === 'final'} />
              ))}
            </section>
          ) : (
            <section className="audience-empty">
              <h2>Waiting for competition</h2>
            </section>
          )}
        </>
      )}
      {!config.standby && (
        <footer className="audience-footer">
          <span>{config.name}</span>
          {!resultRows && (
            <span>
              {`${config.shotFilter === 'all' ? 'All shots' : config.shotFilter === 'series' ? 'Current series' : `Recent ${config.recentShots} shots`} · ${config.zoom === 1 ? 'Full target' : `${config.zoom}× zoom`}`}
            </span>
          )}
          {!resultRows && (
            <span>
              Page {page.page + 1} / {page.pages}
            </span>
          )}
        </footer>
      )}
      {state.identifyUntil > now && (
        <div className="identify-overlay">
          <span className="eyebrow">DISPLAY IDENTIFICATION</span>
          <h1>{config.name}</h1>
          <p>Screen {config.monitorId}</p>
        </div>
      )}
    </main>
  );
}
export function Audience() {
  const [state, setState] = useState<AudienceState | null>(null);
  const [now, setNow] = useState(Date.now);
  const [epoch, setEpoch] = useState(Date.now);
  const [clockFence, setClockFence] = useState(-Infinity);
  useEffect(() => {
    let active = true;
    let serial = 0;
    const refresh = async () => {
      const request = ++serial;
      try {
        const next = await window.vista.getAudience();
        if (active && request === serial) {
          setNow(Date.now());
          setState(next);
        }
      } catch {
        if (active && request === serial)
          setState((last) =>
            last
              ? { ...last, entries: last.entries.map((e) => ({ ...e, state: e.state === 'live' ? 'stale' : e.state })) }
              : null,
          );
      }
    };
    const off = window.vista.onChange(() => {
      void refresh();
    });
    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, 2000);
    let previousWall = Date.now();
    let previousMonotonic = performance.now();
    const tick = window.setInterval(() => {
      const wall = Date.now();
      const monotonic = performance.now();
      if (Math.abs(wall - previousWall - (monotonic - previousMonotonic)) > 1000) setClockFence(wall);
      previousWall = wall;
      previousMonotonic = monotonic;
      setNow(wall);
    }, 250);
    return () => {
      active = false;
      off();
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);
  useEffect(() => setEpoch(Date.now()), [state?.config.id, state?.config.revision]);
  useEffect(() => {
    if (!state) return;
    const revision = state.config.revision;
    let stopped = false;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!stopped) void window.vista.rendered(revision).catch(() => undefined);
      });
    });
    const heartbeat = window.setInterval(() => {
      void window.vista.rendered(revision).catch(() => undefined);
    }, 750);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearInterval(heartbeat);
    };
  }, [state?.config.revision, state?.config.id]);
  return state ? (
    <AudienceView
      state={{
        ...state,
        entries: state.entries.map((entry) =>
          entry.state === 'live' && entry.receivedAt <= clockFence ? { ...entry, state: 'syncing' } : entry,
        ),
      }}
      now={now}
      elapsed={Math.max(0, now - epoch)}
    />
  ) : (
    <main className="audience">
      <section className="standby">
        <p className="eyebrow">SAIKA VISTA</p>
        <h1>Preparing the display</h1>
        <p>Waiting for the display connection.</p>
      </section>
    </main>
  );
}
