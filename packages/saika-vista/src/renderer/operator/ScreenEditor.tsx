// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import {
  findEntry,
  sameSubject,
  type AppState,
  type NodeState,
  type ScreenConfig,
  type ScreenStatus,
} from '../../shared/model';
import { selectedSlots, usesRankingRows } from '../viewModel';

import { NumberField } from './NumberField';
import { SelectionEditor } from './SelectionEditor';
import { SourceDataStatus } from './SourceDataStatus';
import { StatusPill } from './StatusPill';
import type { Run } from './types';

export function ScreenEditor({
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
    (state.sources.find((s) => s.id === draft.selections[0]?.sourceId)?.catalog.identity.kind === 'director' ||
      state.snapshots.some(
        (entry) => sameSubject(entry.snapshot, draft.selections[0]!) && entry.snapshot.ranking !== null,
      ) ||
      (Boolean(status) &&
        initial.view === draft.view &&
        !!initial.selections[0] &&
        sameSubject(draft.selections[0]!, initial.selections[0]) &&
        draft.selections[0]!.follow === initial.selections[0].follow));
  const valid =
    draft.name.trim().length > 0 &&
    draft.monitorId.length > 0 &&
    draft.selections.every((s) => s.sourceId && s.subjectId) &&
    (!rankView || rankAllowed);
  const selectedEntry = draft.selections[0] && findEntry(state.snapshots, draft.selections[0]);
  const resultRows = usesRankingRows(draft, state.snapshots);
  const count = resultRows
    ? (selectedEntry?.snapshot.ranking?.rows.length ?? null)
    : draft.view === 'final' && !selectedEntry
      ? null
      : draft.selections.some((selection) => !selection.participantIds.length && !findEntry(state.snapshots, selection))
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
