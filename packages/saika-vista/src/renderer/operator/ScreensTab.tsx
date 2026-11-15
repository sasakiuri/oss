// SPDX-License-Identifier: MIT
import type { AppState, NodeState, ScreenConfig, ScreenStatus } from '../../shared/model';
import { defaultConfig } from '../viewModel';

import { ScreenEditor } from './ScreenEditor';
import { StatusPill } from './StatusPill';
import type { Run } from './types';

export type ScreenSelection = { nodeId: string; id: string; initial?: ScreenConfig };

export function ScreensTab({
  state,
  nodes,
  screens,
  selection,
  setSelection,
  selectedNode,
  selectedScreen,
  initial,
  filter,
  setFilter,
  busy,
  localControlled,
  run,
  navigate,
  changeTab,
  editorDirty,
  setEditorDirty,
}: {
  state: AppState;
  nodes: NodeState[];
  screens: Array<{ node: NodeState; screen: ScreenStatus }>;
  selection: ScreenSelection | null;
  setSelection: (selection: ScreenSelection | null) => void;
  selectedNode: NodeState | undefined;
  selectedScreen: ScreenStatus | undefined;
  initial: ScreenConfig | undefined;
  filter: string;
  setFilter: (filter: string) => void;
  busy: boolean;
  localControlled: boolean;
  run: Run;
  navigate: (action: () => void) => void;
  changeTab: (tab: 'sources') => void;
  editorDirty: boolean;
  setEditorDirty: (dirty: boolean) => void;
}) {
  return (
    <>
      {!!screens.length && (
        <div className="screen-summary" aria-label="Screen status">
          <span>
            Display confirmed{' '}
            <strong>
              {
                screens.filter(
                  ({ screen: s }) => s.renderAlive && s.monitorAvailable && s.renderedRevision === s.config.revision,
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
                .filter((s) => `${s.config.name} ${node.identity.name}`.toLowerCase().includes(filter.toLowerCase()))
                .map((screen) => (
                  <article
                    className={`screen-card ${selection?.id === screen.config.id && selection.nodeId === node.identity.sourceId ? 'selected' : ''}`}
                    key={screen.config.id}
                  >
                    <button
                      className="screen-select"
                      aria-pressed={selection?.id === screen.config.id && selection.nodeId === node.identity.sourceId}
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
  );
}
