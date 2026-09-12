// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import appIcon from '../../resources/appIcon.png';
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

import { UpdateControls } from './UpdateControls';
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
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  integerOnly?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        disabled={disabled}
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
      <h3>Data reception</h3>
      <p className="field-help">Last data received by this operator PC.</p>
      {!config.selections.length && <p className="muted">No content selected.</p>}
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
            <option value="">Choose a competition</option>
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
          Display label
          <input
            value={selection.label}
            maxLength={200}
            placeholder="Use the competition name"
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
          <p className="muted">{entry ? stateLabel[entry.state] : 'Waiting for the participant list.'}</p>
        )}
        <div className="participant-options">
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
  dirty,
  onDeleted,
  onClose,
  onDirtyChange,
}: {
  initial: ScreenConfig;
  status?: ScreenStatus;
  node: NodeState;
  state: AppState;
  run: Run;
  busy: boolean;
  dirty: boolean;
  onDeleted: () => void;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const editedFields = useRef(new Set<keyof ScreenConfig>());
  const persistedStandby = useRef(status?.config.standby);
  const [requested, setRequested] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
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
    onDirtyChange(true);
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
    setApplying(true);
    if (await run({ type: 'apply', nodeId: node.identity.sourceId, config })) {
      editedFields.current.clear();
      setDraft(config);
      onDirtyChange(false);
      setMessage('Settings sent.');
    } else setMessage('Your draft is retained. Check the error before applying again.');
    setApplying(false);
  };
  return (
    <section className="screen-editor" aria-label="Screen editor">
      <div className="editor-header">
        <div className="editor-title">
          <div>
            <h2 ref={titleRef} tabIndex={-1}>
              {status ? initial.name : 'New audience screen'}
            </h2>
            <p>{node.identity.name}</p>
          </div>
          <div className="editor-apply">
            <span className="draft-state">
              {dirty ? 'Unapplied changes' : node.persistenceError ? 'Storage unconfirmed' : 'No changes'}
            </span>
            <button type="button" className="secondary" disabled={busy} onClick={onClose}>
              Close editor
            </button>
            <button
              className="primary"
              type="submit"
              form={`screen-settings-${draft.id}`}
              disabled={busy || !valid || (!dirty && !!status && !node.persistenceError)}
            >
              {applying ? 'Applying…' : 'Apply to screen'}
            </button>
          </div>
        </div>
        {message && (
          <p className="apply-message" role="status">
            {message}
          </p>
        )}
      </div>
      <div className="display-status" aria-label="Display status" role="status">
        <StatusPill
          good={!!status?.renderAlive && status.monitorAvailable && status.renderedRevision === status.config.revision}
        >
          {!status
            ? 'Screen not created'
            : !status.monitorAvailable
              ? 'Monitor disconnected'
              : status.renderAlive && status.renderedRevision === status.config.revision
                ? status.config.standby
                  ? 'On standby'
                  : 'Displaying'
                : 'Display unconfirmed'}
        </StatusPill>
        <span>
          {node.persistenceError
            ? 'Save not confirmed'
            : status?.appliedRevision === status?.config.revision && status
              ? 'Settings saved on display PC'
              : 'Settings not yet saved on display PC'}
        </span>
      </div>
      {status?.error && (
        <p role="alert" className="inline-error">
          {status.error}
        </p>
      )}
      {status && !status.monitorAvailable && (
        <p className="inline-error">The assigned monitor is disconnected. Choose an available monitor and apply.</p>
      )}
      <form
        id={`screen-settings-${draft.id}`}
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
            <h3>Content</h3>
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
              integerOnly
              disabled={draft.view === 'focus'}
              max={100}
              onChange={(slots) => change({ slots, page: 0 })}
            />
            <NumberField
              label="Seconds per page"
              disabled={!draft.autoRotate}
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
              : `${count} selected ${count === 1 ? 'position' : 'positions'} · ${pages} ${pages === 1 ? 'page' : 'pages'}.`}{' '}
            {resultRows && ' Rows scale to fit the screen; fewer rows give larger text.'}
          </p>
          <details className="editor-options">
            <summary>Target appearance</summary>
            <div className="form-row three">
              <label className="field">
                Target zoom
                <select
                  disabled={resultRows}
                  value={draft.zoom}
                  onChange={(event) => change({ zoom: Number(event.target.value) })}
                >
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
                  disabled={resultRows}
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
                integerOnly
                disabled={resultRows || draft.shotFilter !== 'recent'}
                value={draft.recentShots}
                max={1000}
                onChange={(recentShots) => change({ recentShots })}
              />
            </div>
          </details>
          <details className="editor-options">
            <summary>Startup and standby</summary>
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
              Standby keeps receiving updates. For unattended startup, also enable “Start Vista at login” on the display
              PC.
            </p>
          </details>
        </fieldset>
      </form>
      {status && <SourceDataStatus config={status.config} state={state} />}
      <details className="connection-details">
        <summary>Settings and display confirmation</summary>
        <div className="revision-strip">
          <div>
            <span>Requested</span>
            <strong>{(requested ?? status?.config.revision) ? `v${requested ?? status?.config.revision}` : '—'}</strong>
          </div>
          <div>
            <span>Saved on display PC</span>
            <strong>
              {node.persistenceError
                ? 'Unconfirmed'
                : status?.appliedRevision
                  ? `v${status.appliedRevision}`
                  : 'Not yet'}
            </strong>
          </div>
          <div>
            <span>Audience display</span>
            <strong>
              {status?.renderAlive && status.renderedRevision === status.config.revision && status.monitorAvailable
                ? `Confirmed v${status.renderedRevision}`
                : status?.renderedRevision
                  ? `Last v${status.renderedRevision} · unconfirmed`
                  : 'Not confirmed'}
            </strong>
          </div>
        </div>
      </details>
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
  discover,
  discovering,
  discoveryComplete,
}: {
  kind: 'source' | 'peer';
  run: Run;
  busy: boolean;
  discovered: Discovery[];
  discover: () => Promise<void>;
  discovering: boolean;
  discoveryComplete: boolean;
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
      <h2>{kind === 'source' ? 'Connect a data source' : 'Connect another display PC'}</h2>
      <p className="muted">
        {kind === 'source'
          ? 'Enable Vista sharing in Lane or Director, then enter its endpoint and pairing secret.'
          : 'Enter the endpoint and pairing secret shown in Vista on the display PC.'}
      </p>
      <button type="button" className="secondary" disabled={discovering || busy} onClick={() => void discover()}>
        {discovering ? 'Discovering…' : 'Discover devices'}
      </button>
      {discoveryComplete && (
        <p role="status" className="field-help">
          {candidates.length
            ? `${candidates.length} ${candidates.length === 1 ? 'device found' : 'devices found'}. Choose a device below.`
            : 'No devices found. Enter an endpoint to connect manually.'}
        </p>
      )}
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
          placeholder={kind === 'source' ? 'http://192.168.1.20:45831' : 'http://192.168.1.20:4180'}
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
  const [editorDirty, setEditorDirty] = useState(false);
  const navigate = (action: () => void) => {
    if (busy || (editorDirty && !window.confirm('Discard unapplied screen changes?'))) return;
    setEditorDirty(false);
    action();
  };
  const changeTab = (next: typeof tab) => {
    if (next !== tab)
      navigate(() => {
        setTab(next);
        if (next === 'screens' && selection?.initial && !selectedScreen) setEditorDirty(true);
      });
  };
  const [selection, setSelection] = useState<{ nodeId: string; id: string; initial?: ScreenConfig } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<Discovery[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
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
        <img className="brand-symbol" src={appIcon} alt="" />
        <h1>Saika Vista</h1>
        <p>{error || 'Loading display settings…'}</p>
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
    setDiscoveryComplete(false);
    try {
      setDiscovered(await window.vista.discover());
      setDiscoveryComplete(true);
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
            changeTab('screens');
          }}
        >
          <img className="brand-symbol" src={appIcon} alt="" />
          <div>
            Saika <strong>Vista</strong>
          </div>
        </a>
        <nav aria-label="Main navigation">
          <button
            aria-current={tab === 'screens' ? 'page' : undefined}
            disabled={busy}
            className={tab === 'screens' ? 'active' : ''}
            onClick={() => changeTab('screens')}
          >
            Screens<span className="nav-count">{screens.length}</span>
          </button>
          <button
            aria-current={tab === 'sources' ? 'page' : undefined}
            disabled={busy}
            className={tab === 'sources' ? 'active' : ''}
            onClick={() => changeTab('sources')}
          >
            Data sources<span className="nav-count">{state.sources.length}</span>
          </button>
          <button
            aria-current={tab === 'devices' ? 'page' : undefined}
            disabled={busy}
            className={tab === 'devices' ? 'active' : ''}
            onClick={() => changeTab('devices')}
          >
            Display PCs<span className="nav-count">{nodes.length}</span>
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="muted">This PC</span>
          <strong>{state.local.identity.name}</strong>
        </div>
      </aside>
      <main className="operator-main">
        <header className="operator-header">
          <h1>{tab === 'screens' ? 'Audience screens' : tab === 'sources' ? 'Data sources' : 'Display PCs'}</h1>
        </header>
        {(error || state.error) && (
          <div className="error-banner" role="alert">
            {error || state.error}
            {error && (
              <button className="text-button" onClick={() => setError('')}>
                Dismiss
              </button>
            )}
          </div>
        )}
        {tab === 'screens' && (
          <>
            {!!screens.length && (
              <div className="screen-summary" aria-label="Screen status">
                <span>
                  Display confirmed{' '}
                  <strong>
                    {
                      screens.filter(
                        ({ screen: s }) =>
                          s.renderAlive && s.monitorAvailable && s.renderedRevision === s.config.revision,
                      ).length
                    }{' '}
                    / {screens.length}
                  </strong>
                </span>
                <span>
                  On standby <strong>{screens.filter(({ screen }) => screen.config.standby).length}</strong>
                </span>
                <span>
                  Sources connected{' '}
                  <strong>
                    {state.sources.filter((source) => source.state === 'connected').length} / {state.sources.length}
                  </strong>
                </span>
              </div>
            )}
            <div className={`screens-workspace ${selection && initial ? 'editing' : ''}`}>
              <section className="screens-panel">
                {!!screens.length && (
                  <label className="search-field">
                    <span className="sr-only">Find a screen</span>
                    <input
                      type="search"
                      placeholder="Find a screen or PC…"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </label>
                )}
                {!!screens.length &&
                  filter &&
                  !screens.some(({ node, screen }) =>
                    `${screen.config.name} ${node.identity.name}`.toLowerCase().includes(filter.toLowerCase()),
                  ) && (
                    <p className="empty-note" role="status">
                      No screens match “{filter}”.
                    </p>
                  )}
                {!screens.length && !selection && (
                  <div className="setup-note">
                    <h2>No screens configured</h2>
                    <p>
                      {state.sources.length
                        ? 'Add a screen on an available monitor, then choose its source and view.'
                        : 'Connect a Lane or Director data source, then add a screen on an available monitor.'}
                    </p>
                    {!state.sources.length && (
                      <button className="primary" onClick={() => changeTab('sources')}>
                        Connect a data source
                      </button>
                    )}
                  </div>
                )}
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
                            aria-pressed={
                              selection?.id === screen.config.id && selection.nodeId === node.identity.sourceId
                            }
                            onClick={() => {
                              if (selection?.id !== screen.config.id || selection.nodeId !== node.identity.sourceId)
                                navigate(() => setSelection({ nodeId: node.identity.sourceId, id: screen.config.id }));
                            }}
                          >
                            <div>
                              <h3>{screen.config.name}</h3>
                              <p>
                                {node.monitors.find((monitor) => monitor.id === screen.config.monitorId)?.name ||
                                  'Disconnected monitor'}
                                {' · '}
                                {screen.config.standby
                                  ? 'Standby'
                                  : screen.config.view === 'targets'
                                    ? 'Target grid'
                                    : screen.config.view === 'focus'
                                      ? 'Athlete focus'
                                      : screen.config.view === 'ranking'
                                        ? 'Ranking'
                                        : 'Final'}{' '}
                                · {screen.config.selections.length}{' '}
                                {screen.config.selections.length === 1 ? 'source' : 'sources'}
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
                                    ? screen.config.standby
                                      ? 'On standby'
                                      : 'Displaying'
                                    : 'Display unconfirmed'}
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
                            navigate(() => {
                              setSelection({ nodeId: node.identity.sourceId, id: config.id, initial: config });
                              setEditorDirty(true);
                            });
                          }}
                        >
                          Add screen · {monitor.name}
                        </button>
                      ))}
                    </div>
                    {!node.monitors.length && <p className="empty-note">No monitors available on this PC.</p>}
                  </div>
                ))}
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
                  dirty={editorDirty}
                  onDirtyChange={setEditorDirty}
                  onClose={() => navigate(() => setSelection(null))}
                  onDeleted={() => {
                    setEditorDirty(false);
                    setSelection(null);
                  }}
                />
              )}
            </div>
          </>
        )}
        {tab === 'sources' && (
          <div className={`connections-layout ${state.sources.length ? '' : 'no-connections'}`}>
            <section>
              <div className="section-heading">
                <h2>Registered sources</h2>
              </div>
              {state.sources.map((source) => (
                <article className="connection-card" key={source.id}>
                  <div className="section-heading">
                    <h3>{source.catalog?.identity.name || 'Data source'}</h3>
                    <StatusPill good={source.state === 'connected'}>
                      {source.state === 'connected'
                        ? 'Connected'
                        : source.state === 'connecting'
                          ? 'Connecting'
                          : 'Offline'}
                    </StatusPill>
                  </div>
                  <p className="endpoint">
                    {source.catalog?.identity.kind === 'lane'
                      ? 'Lane'
                      : source.catalog?.identity.kind === 'director'
                        ? 'Director'
                        : 'Connecting'}{' '}
                    · {source.endpoint}
                  </p>
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
              {!state.sources.length && <p className="empty-note">No data sources connected.</p>}
            </section>
            <PairingForm
              kind="source"
              run={run}
              busy={busy}
              discovered={discovered}
              discover={discover}
              discovering={discovering}
              discoveryComplete={discoveryComplete}
            />
          </div>
        )}
        {tab === 'devices' && (
          <div className="connections-layout">
            <section>
              <div className="section-heading">
                <h2>This PC</h2>
              </div>
              <article className="connection-card">
                <div className="section-heading">
                  <h3>{state.local.identity.name}</h3>
                </div>
                <div className="monitor-list">
                  {state.local.monitors.map((m) => (
                    <div key={m.id}>
                      <strong>{m.name}</strong>
                      <span>
                        {m.width} × {m.height}
                        {m.primary ? ' · Primary' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <details className="remote-access">
                  <summary>Control this PC from another Vista</summary>
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
                </details>
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
                <UpdateControls />
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
              {!!state.peers.length && (
                <div className="section-heading">
                  <h2>Remote PCs</h2>
                </div>
              )}
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
                  {peer.node?.persistenceError && <p className="inline-error">{peer.node.persistenceError}</p>}
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
            <PairingForm
              kind="peer"
              run={run}
              busy={busy}
              discovered={discovered}
              discover={discover}
              discovering={discovering}
              discoveryComplete={discoveryComplete}
            />
          </div>
        )}
      </main>
    </div>
  );
}
