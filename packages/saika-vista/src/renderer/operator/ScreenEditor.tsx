// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';

import type { AppState, NodeState, ScreenConfig, ScreenStatus } from '../../shared/model';
import { editorSummary, VIEW_LABEL } from '../viewModel';

import { ConfirmationDetails, DisplayStatus } from './DisplayConfirmation';
import { ScreenActions } from './ScreenActions';
import { AppearanceOptions, LayoutFields, StartupOptions } from './ScreenOptions';
import { SelectionEditor } from './SelectionEditor';
import { SourceDataStatus } from './SourceDataStatus';
import type { Run } from './types';
import { useScreenDraft } from './useScreenDraft';

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
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const { draft, change, apply, requested, applying, message } = useScreenDraft({
    initial,
    status,
    dirty,
    onDirtyChange,
    run,
    nodeId: node.identity.sourceId,
  });
  const { rankView, rankAllowed, valid, resultRows, count, pages } = editorSummary(
    draft,
    status ? initial : undefined,
    state,
  );
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
      <DisplayStatus status={status} node={node} />
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
          if (valid) void apply();
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
                {VIEW_LABEL[view]}
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
          <LayoutFields draft={draft} change={change} resultRows={resultRows} count={count} pages={pages} />
          <AppearanceOptions draft={draft} change={change} resultRows={resultRows} />
          <StartupOptions draft={draft} change={change} />
        </fieldset>
      </form>
      {status && <SourceDataStatus config={status.config} state={state} />}
      <ConfirmationDetails status={status} node={node} requested={requested} />
      {status && (
        <ScreenActions
          status={status}
          nodeId={node.identity.sourceId}
          screenId={draft.id}
          local={node.identity.sourceId === state.local.identity.sourceId}
          run={run}
          busy={busy}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}
