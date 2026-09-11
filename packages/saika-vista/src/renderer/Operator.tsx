// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import type {
  AppState,
  Command,
  Discovery,
  NodeState,
  ScreenConfig,
  ScreenStatus,
  Selection,
  SourceView,
} from '../shared/model';

import { defaultConfig, selectedSlots, stateLabel, usesRankingRows } from './viewModel';

type Run = (command: Command) => Promise<boolean>;
function StatusPill({ good, children }: { good?: boolean; children: React.ReactNode }) {
  return (
    <span className={`status-pill ${good ? 'good' : 'neutral'}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
function NumberField({
  label,
  value,
  min = 1,
  max,
  step = 1,
  integerOnly = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  integerOnly?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && (!integerOnly || Number.isSafeInteger(next)))
            onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, next)));
        }}
      />
    </label>
  );
}
function SourceDataStatus({ config, state }: { config: ScreenConfig; state: AppState }) {
  return (
    <section className="source-data-status" aria-label="Source data for requested settings">
      <h3>Source data for requested settings v{config.revision}</h3>
      <p className="field-help">
        Data received on this PC. Audience rendering is confirmed separately above. Apply drafts to update these
        subjects.
      </p>
      {!config.selections.length && <p className="muted">No subjects requested.</p>}
      {config.selections.map((selection, index) => {
        const source = state.sources.find((candidate) => candidate.id === selection.sourceId);
        const entry = state.snapshots.find(
          ({ snapshot }) => snapshot.sourceId === selection.sourceId && snapshot.subjectId === selection.subjectId,
        );
        const resultRows = usesRankingRows(config, state.snapshots);
        const slots = selectedSlots(
          {
            ...config,
            selections: [resultRows ? { ...selection, participantIds: [] } : selection],
          },
          state.snapshots,
        );
        const issues =
          resultRows && entry?.snapshot.ranking?.kind === 'competition'
            ? []
            : slots.filter(({ participant }) =>
                participant ? participant.dataState !== 'live' || !participant.historyComplete : !resultRows,
              );
        const receipt = entry ? new Date(entry.receivedAt) : null;
        const dataState =
          entry?.state === 'live' && (Date.now() - entry.receivedAt > 5000 || Date.now() < entry.receivedAt)
            ? 'stale'
            : entry?.state;
        return (
          <article key={index} className="subject-data-status">
            <strong>
              {source?.catalog?.identity.name || selection.sourceId} ·{' '}
              {entry?.snapshot.label ||
                source?.catalog?.subjects.find((subject) => subject.id === selection.subjectId)?.label ||
                selection.subjectId}
            </strong>
            <StatusPill good={dataState === 'live' && !issues.length}>
              {dataState ? stateLabel[dataState] : 'Waiting for data'}
            </StatusPill>
            <p className="field-help">
              Last received on this PC:{' '}
              {receipt ? (
                <time dateTime={Number.isNaN(receipt.valueOf()) ? undefined : receipt.toISOString()}>
                  {receipt.toLocaleString('en-GB')}
                </time>
              ) : (
                'Never'
              )}
            </p>
            {!!issues.length && entry && (
              <ul className="subject-data-issues">
                {issues.map(({ key, participant, requestedId }) => (
                  <li key={key}>
                    {participant
                      ? `${participant.laneName} · ${participant.name || 'Unnamed athlete'}: ${[
                          ...(participant.dataState !== 'live' ? [stateLabel[participant.dataState]] : []),
                          ...(!participant.historyComplete ? ['Partial history'] : []),
                        ].join(' · ')}`
                      : `${requestedId || 'Participants'}: Selected target unavailable`}
                  </li>
                ))}
              </ul>
            )}
            {(entry?.error || (!entry && source?.error)) && (
              <p className="inline-error">{entry?.error || source?.error}</p>
            )}
          </article>
        );
      })}
    </section>
  );
}
function SelectionEditor({
  selection,
  onChange,
  onRemove,
  sources,
  state,
  index,
  inspect,
  resultRows,
}: {
  selection: Selection;
  onChange: (s: Selection) => void;
  onRemove: () => void;
  sources: SourceView[];
  state: AppState;
  index: number;
  inspect: Run;
  resultRows: boolean;
}) {
  const source = sources.find((s) => s.id === selection.sourceId);
  const entry = state.snapshots.find(
    (e) => e.snapshot.sourceId === selection.sourceId && e.snapshot.subjectId === selection.subjectId,
  );
  const participants = entry?.snapshot.participants ?? [];
  const changeSubject = (sourceId: string, subjectId: string) => {
    const snapshot = state.snapshots.find(
      (e) => e.snapshot.sourceId === sourceId && e.snapshot.subjectId === subjectId,
    )?.snapshot;
    onChange({
      ...selection,
      sourceId,
      subjectId,
      label: '',
      participantIds: snapshot?.participants.map((p) => (selection.follow === 'lane' ? p.laneId : p.id)) ?? [],
    });
    if (sourceId && subjectId) void inspect({ type: 'inspectSubject', sourceId, subjectId });
  };
  const chosen = selection.participantIds;
  const availableIds = participants.map((p) => (selection.follow === 'lane' ? p.laneId : p.id));
  return (
    <fieldset className="selection-card">
      <legend>Source {index + 1}</legend>
      <div className="form-row">
        <label className="field">
          Data source
          <select
            value={selection.sourceId}
            onChange={(event) => {
              const next = sources.find((s) => s.id === event.target.value);
              changeSubject(
                event.target.value,
                next?.catalog?.subjects.find((s) => s.availability === 'available')?.id ?? '',
              );
            }}
          >
            <option value="">Choose a source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.catalog?.identity.name || s.endpoint} · {s.catalog?.identity.kind || s.state}
              </option>
            ))}
            {selection.sourceId && !source && <option value={selection.sourceId}>Unavailable source</option>}
          </select>
        </label>
        <label className="field">
          Competition / session
          <select
            value={selection.subjectId}
            onChange={(event) => changeSubject(selection.sourceId, event.target.value)}
          >
            <option value="">Choose a subject</option>
            {source?.catalog?.subjects.map((s) => (
              <option key={s.id} value={s.id} disabled={s.availability !== 'available'}>
                {s.label} · {s.eventCode}
                {s.availability !== 'available' ? ` · ${s.reason || 'Unsupported'}` : ''}
              </option>
            ))}
            {selection.subjectId && !source?.catalog?.subjects.some((s) => s.id === selection.subjectId) && (
              <option value={selection.subjectId}>Saved selection · unavailable</option>
            )}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label className="field">
          Follow
          <select
            value={selection.follow}
            disabled={resultRows}
            onChange={(event) => {
              const follow = event.target.value as Selection['follow'];
              onChange({
                ...selection,
                follow,
                participantIds: participants
                  .filter((p) => !chosen.length || chosen.includes(selection.follow === 'lane' ? p.laneId : p.id))
                  .map((p) => (follow === 'lane' ? p.laneId : p.id)),
              });
            }}
          >
            <option value="lane">Fixed lanes</option>
            <option value="athlete" disabled={source?.catalog?.identity.kind === 'lane'}>
              Athletes across lane changes
            </option>
          </select>
        </label>
        <label className="field">
          Display label (this subject only)
          <input
            value={selection.label}
            maxLength={200}
            placeholder="Use the source's name"
            onChange={(event) => onChange({ ...selection, label: event.target.value })}
          />
        </label>
      </div>
      <div className="participant-picker">
        <div className="picker-heading">
          <span>{selection.follow === 'lane' ? 'Lanes to display' : 'Athletes to follow'}</span>
          <button
            type="button"
            className="text-button"
            disabled={resultRows || !participants.length}
            onClick={() => onChange({ ...selection, participantIds: availableIds })}
          >
            Select current {selection.follow === 'lane' ? 'lanes' : 'athletes'}
          </button>
        </div>
        {!participants.length && (
          <p className="muted">{entry ? stateLabel[entry.state] : 'Waiting for this subject’s participant list.'}</p>
        )}
        {participants.map((p) => {
          const id = selection.follow === 'lane' ? p.laneId : p.id;
          return (
            <label key={id} className="check-field">
              <input
                type="checkbox"
                checked={chosen.includes(id)}
                disabled={resultRows}
                onChange={(event) =>
                  onChange({
                    ...selection,
                    participantIds: event.target.checked ? [...chosen, id] : chosen.filter((key) => key !== id),
                  })
                }
              />
              <span>
                {p.laneName} · {p.name || 'Unnamed athlete'}
              </span>
            </label>
          );
        })}
        {chosen
          .filter((id) => !availableIds.includes(id))
          .map((id) => (
            <label key={id} className="check-field">
              <input
                type="checkbox"
                checked
                disabled={resultRows}
                onChange={() => onChange({ ...selection, participantIds: chosen.filter((key) => key !== id) })}
              />
              <span>Unavailable selection · {id}</span>
            </label>
          ))}
      </div>
      {!chosen.length && !resultRows && (
        <p className="field-help">
          All participants in this subject will be displayed. Select specific lanes or athletes to reserve their
          positions when unavailable.
        </p>
      )}
      <button type="button" className="text-button danger" onClick={onRemove}>
        Remove source from screen
      </button>
    </fieldset>
  );
}
function ScreenEditor({
  initial,
  status,
  node,
  state,
  run,
  busy,
  onDeleted,
}: {
  initial: ScreenConfig;
  status?: ScreenStatus;
  node: NodeState;
  state: AppState;
  run: Run;
  busy: boolean;
  onDeleted: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(!status);
  const editedFields = useRef(new Set<keyof ScreenConfig>());
  const persistedStandby = useRef(status?.config.standby);
  const [requested, setRequested] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!status) return;
    // A completed toolbar standby action supersedes earlier edits to this field.
    if (status.config.standby !== persistedStandby.current) editedFields.current.delete('standby');
    persistedStandby.current = status.config.standby;
    setDraft((current) => {
      const edits = Object.fromEntries([...editedFields.current].map((key) => [key, current[key]]));
      return { ...status.config, ...edits };
    });
  }, [status?.config.revision, dirty]);
  const change = (changes: Partial<ScreenConfig>) => {
    for (const key of Object.keys(changes) as Array<keyof ScreenConfig>) editedFields.current.add(key);
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
    setMessage('');
  };
  const rankView = draft.view === 'ranking' || draft.view === 'final';
  const rankAllowed =
    draft.selections.length === 1 &&
    (state.sources.find((s) => s.id === draft.selections[0]?.sourceId)?.catalog?.identity.kind === 'director' ||
      state.snapshots.some(
        (entry) =>
          entry.snapshot.sourceId === draft.selections[0]?.sourceId &&
          entry.snapshot.subjectId === draft.selections[0]?.subjectId &&
          entry.snapshot.ranking !== null,
      ) ||
      (Boolean(status) &&
        initial.view === draft.view &&
        draft.selections[0]!.sourceId === initial.selections[0]?.sourceId &&
        draft.selections[0]!.subjectId === initial.selections[0]?.subjectId &&
        draft.selections[0]!.follow === initial.selections[0]?.follow));
  const valid =
    draft.name.trim().length > 0 &&
    draft.monitorId.length > 0 &&
    draft.selections.every((s) => s.sourceId && s.subjectId) &&
    (!rankView || rankAllowed);
  const selectedEntry = state.snapshots.find(
    (entry) =>
      entry.snapshot.sourceId === draft.selections[0]?.sourceId &&
      entry.snapshot.subjectId === draft.selections[0]?.subjectId,
  );
  const resultRows = usesRankingRows(draft, state.snapshots);
  const count = resultRows
    ? (selectedEntry?.snapshot.ranking?.rows.length ?? null)
    : draft.view === 'final' && !selectedEntry
      ? null
      : draft.selections.some(
            (selection) =>
              !selection.participantIds.length &&
              !state.snapshots.some(
                ({ snapshot }) =>
                  snapshot.sourceId === selection.sourceId && snapshot.subjectId === selection.subjectId,
              ),
          )
        ? null
        : selectedSlots(draft, state.snapshots).length;
  const pages = count === null ? null : Math.max(1, Math.ceil(count / (draft.view === 'focus' ? 1 : draft.slots)));
  const apply = async () => {
    if (!valid) return;
    const config = { ...draft, name: draft.name.trim(), revision: (status?.config.revision ?? 0) + 1 };
    setRequested(config.revision);
    if (await run({ type: 'apply', nodeId: node.identity.sourceId, config })) {
      editedFields.current.clear();
      setDraft(config);
      setDirty(false);
      setMessage('Configuration saved. Renderer confirmation is shown above.');
    } else setMessage('Apply failed. Your draft is retained.');
  };
  return (
    <section className="screen-editor" aria-label="Screen editor">
      <div className="editor-title">
        <div>
          <p className="eyebrow">SCREEN CONFIGURATION</p>
          <h2>{status ? initial.name : 'New audience screen'}</h2>
          <p>{node.identity.name}</p>
        </div>
        <StatusPill good={!dirty}>{dirty ? 'Unapplied draft' : 'Saved configuration'}</StatusPill>
      </div>
      <div className="revision-strip">
        <div>
          <span>Requested</span>
          <strong>{requested === null ? '—' : `v${requested}`}</strong>
        </div>
        <div>
          <span>Persisted on display PC</span>
          <strong>{status?.appliedRevision ? `v${status.appliedRevision}` : 'Not yet'}</strong>
        </div>
        <div>
          <span>Audience renderer</span>
          <strong>
            {status?.renderAlive && status.renderedRevision === status.config.revision && status.monitorAvailable
              ? `Confirmed v${status.renderedRevision}`
              : status?.renderedRevision
                ? `Last v${status.renderedRevision} · unconfirmed`
                : 'Not confirmed'}
          </strong>
        </div>
      </div>
      {status?.error && (
        <p role="alert" className="inline-error">
          {status.error}
        </p>
      )}
      {status && !status.monitorAvailable && (
        <p className="inline-error">The assigned monitor is disconnected. Choose an available monitor and apply.</p>
      )}
      {status && <SourceDataStatus config={status.config} state={state} />}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <fieldset disabled={busy} className="editor-fields">
          <div className="form-row">
            <label className="field">
              Screen name
              <input
                value={draft.name}
                required
                maxLength={200}
                onChange={(event) => change({ name: event.target.value })}
              />
            </label>
            <label className="field">
              Monitor
              <select value={draft.monitorId} onChange={(event) => change({ monitorId: event.target.value })}>
                {node.monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.width} × {m.height}
                    {m.primary ? ' · primary' : ''}
                  </option>
                ))}
                {!node.monitors.some((m) => m.id === draft.monitorId) && (
                  <option value={draft.monitorId}>Disconnected monitor</option>
                )}
              </select>
            </label>
          </div>
          <div className="view-selector" role="group" aria-label="Display view">
            {(['targets', 'focus', 'ranking', 'final'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={draft.view === view ? 'selected' : ''}
                aria-pressed={draft.view === view}
                onClick={() => change({ view, page: 0 })}
              >
                <span aria-hidden="true">
                  {view === 'targets' ? '▦' : view === 'focus' ? '◎' : view === 'ranking' ? '≡' : '◈'}
                </span>
                {view === 'targets'
                  ? 'Target grid'
                  : view === 'focus'
                    ? 'Athlete focus'
                    : view === 'ranking'
                      ? 'Ranking'
                      : 'Final'}
              </button>
            ))}
          </div>
          {rankView && !rankAllowed && (
            <p className="inline-error">
              Ranking and final standings require one Saika Director subject. Lane sources support target grid and
              athlete focus.
            </p>
          )}
          {resultRows && (
            <p className="field-help">
              Rankings and competition results in Final display the complete selected result scope. Lane and athlete
              selections below are retained for target views and do not filter these results.
            </p>
          )}
          {draft.view === 'final' && !resultRows && (
            <p className="field-help">
              Final shows selected targets for live standings. Competition results show all result rows, including other
              relays, using Director's result scores and places. Their publication state is shown separately.
            </p>
          )}
          <div className="section-heading">
            <h3>Display subjects</h3>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                change({
                  selections: [
                    ...draft.selections,
                    { sourceId: '', subjectId: '', participantIds: [], follow: 'lane', label: '' },
                  ],
                })
              }
            >
              + Add source
            </button>
          </div>
          {!draft.selections.length && (
            <p className="empty-note">Add a Lane or Director source to choose what this screen displays.</p>
          )}
          {draft.selections.map((selection, index) => (
            <SelectionEditor
              key={index}
              index={index}
              selection={selection}
              inspect={run}
              resultRows={resultRows}
              state={state}
              sources={state.sources}
              onChange={(next) => change({ selections: draft.selections.map((s, i) => (i === index ? next : s)) })}
              onRemove={() => change({ selections: draft.selections.filter((_, i) => i !== index) })}
            />
          ))}
          <h3>Layout & rotation</h3>
          <div className="form-row three">
            <NumberField
              label={resultRows ? 'Rows per page' : 'Targets per page'}
              value={draft.slots}
              max={100}
              onChange={(slots) => change({ slots, page: 0 })}
            />
            <NumberField
              label="Seconds per page"
              value={draft.pageSeconds}
              max={3600}
              step="any"
              onChange={(pageSeconds) => change({ pageSeconds })}
            />
            <NumberField
              label="Starting page"
              integerOnly
              value={draft.page + 1}
              max={pages === null ? undefined : Math.max(pages, draft.page + 1)}
              onChange={(page) => change({ page: page - 1 })}
            />
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.autoRotate}
              onChange={(event) => change({ autoRotate: event.target.checked })}
            />
            Rotate pages automatically
          </label>
          <p className="field-help">
            {count === null
              ? 'Position and page counts are unavailable on this PC. Set a starting page and confirm it on the audience screen.'
              : `${count} selected positions · ${pages} pages.`}{' '}
            Page density is limited to 100; there is no total lane or monitor limit.
            {resultRows && ' Rows scale to fit the screen; fewer rows give larger text.'}
          </p>
          <h3>Target appearance</h3>
          <div className="form-row three">
            <label className="field">
              Target zoom
              <select value={draft.zoom} onChange={(event) => change({ zoom: Number(event.target.value) })}>
                {[1, 2, 3, 4, 6, 8, 12, 16].map((zoom) => (
                  <option value={zoom} key={zoom}>
                    {zoom === 1 ? 'Full target' : `${zoom}× · center fixed`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Shot display
              <select
                value={draft.shotFilter}
                onChange={(event) => change({ shotFilter: event.target.value as ScreenConfig['shotFilter'] })}
              >
                <option value="all">All shots</option>
                <option value="series">Current series</option>
                <option value="recent">Recent shots</option>
              </select>
            </label>
            <NumberField
              label="Recent shot count"
              value={draft.recentShots}
              max={1000}
              onChange={(recentShots) => change({ recentShots })}
            />
          </div>
          <h3>Display behavior</h3>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.standby}
              onChange={(event) => change({ standby: event.target.checked })}
            />
            Show standby screen
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.autoStart}
              onChange={(event) => change({ autoStart: event.target.checked })}
            />
            Open this audience screen automatically when Vista starts
          </label>
          <p className="field-help">
            Standby keeps receiving competition updates and is restored after restart. Enable “Start Vista at login” on
            the display PC for unattended startup.
          </p>
          <div className="apply-bar">
            <div>
              <strong>{dirty ? 'Changes are ready to apply' : 'Configuration is up to date'}</strong>
              <p>Each screen changes only after Apply.</p>
            </div>
            <button className="primary" type="submit" disabled={!valid || (!dirty && !!status)}>
              {busy ? 'Applying…' : 'Apply to screen'}
            </button>
          </div>
          {message && (
            <p className="field-help" role="status">
              {message}
            </p>
          )}
        </fieldset>
      </form>
      {status && (
        <div className="screen-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              void run({ type: 'identify', nodeId: node.identity.sourceId, screenId: draft.id });
            }}
          >
            Identify on monitor
          </button>
          {node.identity.sourceId === state.local.identity.sourceId && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                void run({ type: status.renderAlive ? 'closeScreen' : 'openScreen', screenId: draft.id });
              }}
            >
              {status.renderAlive ? 'Close audience window' : 'Open audience window'}
            </button>
          )}
          <button
            className="text-button danger"
            disabled={busy}
            onClick={async () => {
              if (await run({ type: 'removeScreen', nodeId: node.identity.sourceId, screenId: draft.id })) onDeleted();
            }}
          >
            Remove screen
          </button>
        </div>
      )}
    </section>
  );
}
function PairingForm({
  kind,
  run,
  busy,
  discovered,
}: {
  kind: 'source' | 'peer';
  run: Run;
  busy: boolean;
  discovered: Discovery[];
}) {
  const [endpoint, setEndpoint] = useState('');
  const [secret, setSecret] = useState('');
  const candidates = discovered.filter((d) =>
    kind === 'peer' ? d.identity.kind === 'display' : d.identity.kind !== 'display',
  );
  return (
    <form
      className="pairing-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await run({ type: kind === 'peer' ? 'connectPeer' : 'connectSource', endpoint, secret })) {
          setSecret('');
          setEndpoint('');
        }
      }}
    >
      <h3>{kind === 'source' ? 'Pair a data source' : 'Pair a display PC'}</h3>
      <p className="muted">
        {kind === 'source'
          ? 'Enable Vista sharing in Lane or Director, then enter its endpoint and pairing secret.'
          : 'Enter the endpoint and pairing secret shown in Vista on the display PC.'}
      </p>
      {candidates.length > 0 && (
        <label className="field">
          Discovered on this network
          <select
            value={candidates.some((d) => d.endpoint === endpoint) ? endpoint : ''}
            onChange={(event) => setEndpoint(event.target.value)}
          >
            <option value="">Choose a discovered device</option>
            {candidates.map((d) => (
              <option value={d.endpoint} key={d.identity.sourceId}>
                {d.identity.name} · {d.endpoint}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        Endpoint
        <input
          type="url"
          required
          placeholder="http://192.168.1.20:4180"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
        />
      </label>
      <label className="field">
        Pairing secret
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          minLength={32}
          maxLength={256}
          placeholder="Paste the secret from the device"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
      </label>
      <button type="submit" className="primary" disabled={busy || !endpoint || secret.length < 32}>
        {busy ? 'Connecting…' : kind === 'source' ? 'Connect source' : 'Connect display PC'}
      </button>
    </form>
  );
}
export function Operator() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<'screens' | 'sources' | 'devices'>('screens');
  const [selection, setSelection] = useState<{ nodeId: string; id: string; initial?: ScreenConfig } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<Discovery[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let active = true;
    let serial = 0;
    const refresh = async () => {
      const request = ++serial;
      try {
        const next = await window.vista.getState();
        if (active && request === serial) setState(next);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load Vista state.');
      }
    };
    const off = window.vista.onChange(() => {
      void refresh();
    });
    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      active = false;
      off();
      clearInterval(poll);
    };
  }, []);
  const run: Run = async (command) => {
    setBusy(true);
    setError('');
    try {
      await window.vista.command(command);
      setState(await window.vista.getState());
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!state)
    return (
      <main className="operator loading">
        <div className="brand-symbol">◎</div>
        <h1>Saika Vista</h1>
        <p>{error || 'Connecting to your display workspace…'}</p>
      </main>
    );
  const nodes = [
    state.local,
    ...state.peers.flatMap((p) =>
      p.node
        ? [
            {
              ...p.node,
              screens: p.node.screens.map((screen) => (p.error ? { ...screen, renderAlive: false } : screen)),
            },
          ]
        : [],
    ),
  ];
  const screens = nodes.flatMap((node) => node.screens.map((screen) => ({ node, screen })));
  const selectedNode = nodes.find((node) => node.identity.sourceId === selection?.nodeId);
  const selectedScreen = selectedNode?.screens.find((screen) => screen.config.id === selection?.id);
  const initial = selectedScreen?.config ?? selection?.initial;
  const localControlled = Boolean(state.local.controllerId);
  const discover = async () => {
    setDiscovering(true);
    setDiscoveryMessage('');
    try {
      const candidates = await window.vista.discover();
      setDiscovered(candidates);
      setDiscoveryMessage(
        candidates.length
          ? `${candidates.length} devices discovered. Select a candidate below to pair.`
          : 'No devices found. You can still enter an endpoint manually.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Discovery failed. Enter the endpoint manually.');
    } finally {
      setDiscovering(false);
    }
  };
  return (
    <div className="operator">
      <aside className="sidebar">
        <a
          className="operator-brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setTab('screens');
          }}
        >
          <span className="brand-symbol" aria-hidden="true">
            ◎
          </span>
          <div>
            saika <strong>vista</strong>
            <small>VENUE DISPLAY CONTROL</small>
          </div>
        </a>
        <nav aria-label="Main navigation">
          <button className={tab === 'screens' ? 'active' : ''} onClick={() => setTab('screens')}>
            <span aria-hidden="true">▦</span>Screens<span className="nav-count">{screens.length}</span>
          </button>
          <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}>
            <span aria-hidden="true">◉</span>Data sources<span className="nav-count">{state.sources.length}</span>
          </button>
          <button className={tab === 'devices' ? 'active' : ''} onClick={() => setTab('devices')}>
            <span aria-hidden="true">▣</span>Display PCs<span className="nav-count">{nodes.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="eyebrow">THIS PC</span>
          <strong>{state.local.identity.name}</strong>
          <span className="muted">Local network · Offline ready</span>
        </div>
      </aside>
      <main className="operator-main">
        <header className="operator-header">
          <div>
            <p className="eyebrow">VENUE WORKSPACE</p>
            <h1>{tab === 'screens' ? 'Audience screens' : tab === 'sources' ? 'Data sources' : 'Display PCs'}</h1>
            <p>
              {tab === 'screens'
                ? 'Set the view. Give every seat a clear picture.'
                : tab === 'sources'
                  ? 'Connect the competition to your audience.'
                  : 'Manage monitors across the venue.'}
            </p>
          </div>
          <StatusPill good={state.sources.some((s) => s.state === 'connected')}>
            {state.sources.filter((s) => s.state === 'connected').length} sources connected
          </StatusPill>
        </header>
        {(error || state.error) && (
          <div className="error-banner" role="alert">
            {error || state.error}
            <button className="text-button" onClick={() => setError('')}>
              Dismiss
            </button>
          </div>
        )}
        {tab === 'screens' && (
          <>
            <div className="overview">
              <div>
                <span>Audience screens</span>
                <strong>{screens.length}</strong>
              </div>
              <div>
                <span>Rendering confirmed</span>
                <strong>
                  {
                    screens.filter(
                      ({ screen: s }) =>
                        s.renderAlive && s.monitorAvailable && s.renderedRevision === s.config.revision,
                    ).length
                  }
                  <small> / {screens.length}</small>
                </strong>
              </div>
              <div>
                <span>Available monitors</span>
                <strong>{nodes.reduce((n, node) => n + node.monitors.length, 0)}</strong>
              </div>
              <div>
                <span>On standby</span>
                <strong>{screens.filter(({ screen }) => screen.config.standby).length}</strong>
              </div>
            </div>
            <div className={`screens-workspace ${selection && initial ? 'editing' : ''}`}>
              <section className="screens-panel">
                <div className="section-heading">
                  <h2>Your screens</h2>
                </div>
                <label className="search-field">
                  <span className="sr-only">Find a screen</span>
                  <input
                    type="search"
                    placeholder="Find a screen or PC…"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </label>
                {nodes.map((node) => (
                  <div className="node-group" key={node.identity.sourceId}>
                    <div className="node-title">
                      <h3>{node.identity.name}</h3>
                      <span>{node === state.local ? 'This PC' : 'Remote PC'}</span>
                    </div>
                    {node.screens
                      .filter((s) =>
                        `${s.config.name} ${node.identity.name}`.toLowerCase().includes(filter.toLowerCase()),
                      )
                      .map((screen) => (
                        <article
                          className={`screen-card ${selection?.id === screen.config.id && selection.nodeId === node.identity.sourceId ? 'selected' : ''}`}
                          key={screen.config.id}
                        >
                          <button
                            className="screen-select"
                            onClick={() => setSelection({ nodeId: node.identity.sourceId, id: screen.config.id })}
                          >
                            <div className="monitor-icon" aria-hidden="true">
                              {screen.config.standby ? '◎' : screen.config.view === 'ranking' ? '≡' : '▦'}
                            </div>
                            <div>
                              <h3>{screen.config.name}</h3>
                              <p>
                                {screen.config.standby ? 'Standby' : screen.config.view} ·{' '}
                                {screen.config.selections.length} sources
                              </p>
                              <StatusPill
                                good={
                                  screen.renderAlive &&
                                  screen.renderedRevision === screen.config.revision &&
                                  screen.monitorAvailable
                                }
                              >
                                {!screen.monitorAvailable
                                  ? 'Monitor missing'
                                  : screen.renderAlive && screen.renderedRevision === screen.config.revision
                                    ? `Rendering v${screen.config.revision}`
                                    : `Awaiting rendering v${screen.config.revision}`}
                              </StatusPill>
                            </div>
                          </button>
                          <div className="card-actions">
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => {
                                void run({
                                  type: 'identify',
                                  nodeId: node.identity.sourceId,
                                  screenId: screen.config.id,
                                });
                              }}
                            >
                              Identify
                            </button>
                            <button
                              className="text-button"
                              disabled={busy || (node === state.local && localControlled)}
                              onClick={() => {
                                void run({
                                  type: 'apply',
                                  nodeId: node.identity.sourceId,
                                  config: {
                                    ...screen.config,
                                    revision: screen.config.revision + 1,
                                    standby: !screen.config.standby,
                                  },
                                });
                              }}
                            >
                              {screen.config.standby ? 'Resume display' : 'Standby'}
                            </button>
                          </div>
                        </article>
                      ))}
                    <div className="add-screen-row">
                      {node.monitors.map((monitor) => (
                        <button
                          className="add-screen"
                          key={monitor.id}
                          disabled={
                            node.screens.some((s) => s.config.monitorId === monitor.id) ||
                            (node === state.local && localControlled)
                          }
                          onClick={() => {
                            const config = defaultConfig(monitor.id, monitor.name);
                            setSelection({ nodeId: node.identity.sourceId, id: config.id, initial: config });
                          }}
                        >
                          + Screen on {monitor.name}
                        </button>
                      ))}
                    </div>
                    {!node.monitors.length && <p className="empty-note">No monitors available on this PC.</p>}
                  </div>
                ))}
                {!screens.length && (
                  <div className="setup-note">
                    <div className="setup-icon" aria-hidden="true">
                      ▦
                    </div>
                    <h2>Your audience starts here</h2>
                    <p>
                      Connect a data source, then add a screen on a monitor above. Choose its subjects and apply when
                      ready.
                    </p>
                    <button className="secondary" onClick={() => setTab('sources')}>
                      Connect a data source
                    </button>
                  </div>
                )}
              </section>
              {selectedNode && initial && (
                <ScreenEditor
                  key={`${selectedNode.identity.sourceId}:${initial.id}`}
                  initial={initial}
                  status={selectedScreen}
                  node={selectedNode}
                  state={state}
                  run={run}
                  busy={busy || (selectedNode === state.local && localControlled)}
                  onDeleted={() => setSelection(null)}
                />
              )}
            </div>
          </>
        )}
        {tab === 'sources' && (
          <div className="connections-layout">
            <section>
              <div className="section-heading">
                <h2>Connected sources</h2>
                <button
                  className="secondary"
                  disabled={discovering}
                  onClick={() => {
                    void discover();
                  }}
                >
                  {discovering ? 'Discovering…' : 'Discover devices'}
                </button>
              </div>
              {discoveryMessage && (
                <p role="status" className="field-help">
                  {discoveryMessage}
                </p>
              )}
              {state.sources.map((source) => (
                <article className="connection-card" key={source.id}>
                  <div className="section-heading">
                    <h3>{source.catalog?.identity.name || 'Data source'}</h3>
                    <StatusPill good={source.state === 'connected'}>{source.state}</StatusPill>
                  </div>
                  <p className="endpoint">{source.endpoint}</p>
                  <span className="eyebrow">{source.catalog?.identity.kind || 'CONNECTING'}</span>
                  {source.error && <p className="inline-error">{source.error}</p>}
                  <ul className="subject-list">
                    {source.catalog?.subjects.map((s) => (
                      <li key={s.id}>
                        <strong>{s.label}</strong>
                        <span>
                          {s.eventCode} · {s.relay || s.competition || s.availability}
                        </span>
                        {s.reason && <span className="inline-error">{s.reason}</span>}
                      </li>
                    ))}
                  </ul>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      void run({ type: 'removeSource', id: source.id });
                    }}
                  >
                    Disconnect source
                  </button>
                </article>
              ))}
              {!state.sources.length && (
                <p className="empty-note">
                  No sources paired yet. Lane provides targets and scores; Director also provides competition standings.
                </p>
              )}
            </section>
            <PairingForm kind="source" run={run} busy={busy} discovered={discovered} />
          </div>
        )}
        {tab === 'devices' && (
          <div className="connections-layout">
            <section>
              <div className="section-heading">
                <h2>Display computers</h2>
                <button
                  className="secondary"
                  disabled={discovering}
                  onClick={() => {
                    void discover();
                  }}
                >
                  {discovering ? 'Discovering…' : 'Discover devices'}
                </button>
              </div>
              {discoveryMessage && (
                <p role="status" className="field-help">
                  {discoveryMessage}
                </p>
              )}
              <article className="connection-card">
                <div className="section-heading">
                  <h3>{state.local.identity.name}</h3>
                  <StatusPill good>This PC</StatusPill>
                </div>
                <div className="monitor-list">
                  {state.local.monitors.map((m) => (
                    <div key={m.id}>
                      <span aria-hidden="true">▣</span>
                      <strong>{m.name}</strong>
                      <span>
                        {m.width} × {m.height}
                        {m.primary ? ' · Primary' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <h3>Pair this PC from another Vista</h3>
                <p className="field-help">Use one of these endpoints and the pairing secret on your operator PC.</p>
                {state.endpoints.map((endpoint) => (
                  <p className="endpoint" key={endpoint}>
                    {endpoint}
                  </p>
                ))}
                <label className="field">
                  This PC’s pairing secret
                  <div className="secret-field">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      readOnly
                      value={state.pairingSecret}
                      aria-label="This PC’s pairing secret"
                    />
                    <button type="button" className="secondary" onClick={() => setShowSecret(!showSecret)}>
                      {showSecret ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={state.loginStart}
                    disabled={busy}
                    onChange={(event) => {
                      void run({ type: 'setLoginStart', enabled: event.target.checked });
                    }}
                  />
                  Start Vista at login on this PC
                </label>
                {state.local.controllerId && (
                  <div className="controller-note">
                    <p>This PC is managed by another operator.</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        void run({ type: 'revokeController' });
                      }}
                    >
                      Revoke remote controller
                    </button>
                  </div>
                )}
              </article>
              {state.peers.map((peer) => (
                <article className="connection-card" key={peer.id}>
                  <div className="section-heading">
                    <h3>{peer.node?.identity.name || 'Display PC'}</h3>
                    <StatusPill good={!!peer.node && !peer.error}>
                      {peer.node && !peer.error ? 'Connected' : 'Offline'}
                    </StatusPill>
                  </div>
                  <p className="endpoint">{peer.endpoint}</p>
                  {peer.error && <p className="inline-error">{peer.error}</p>}
                  <p>
                    {peer.node?.monitors.length ?? 0} monitors · {peer.node?.screens.length ?? 0} screens
                  </p>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => {
                      void run({ type: 'removePeer', id: peer.id });
                    }}
                  >
                    Disconnect display PC
                  </button>
                </article>
              ))}
            </section>
            <PairingForm kind="peer" run={run} busy={busy} discovered={discovered} />
          </div>
        )}
        <footer className="operator-footer">
          <span>Saika Vista</span>
          <span>Audience display · Competition control stays with Lane and Director</span>
        </footer>
      </main>
    </div>
  );
}
