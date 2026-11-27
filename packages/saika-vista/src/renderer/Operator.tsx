// SPDX-License-Identifier: MIT
import type { VistaNode } from '@sasakiuri/saika-protocol/Vista';
import { useState } from 'react';

import appIcon from '../../resources/appIcon.png';
import type { AppState } from '../shared/model';

import { DevicesTab } from './operator/DevicesTab';
import { ScreensTab, type ScreenSelection } from './operator/ScreensTab';
import { SourcesTab } from './operator/SourcesTab';
import type { Run } from './operator/types';
import { useBridgeRefresh } from './useBridgeRefresh';

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
  const [selection, setSelection] = useState<ScreenSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discovered, setDiscovered] = useState<VistaNode[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoveryComplete, setDiscoveryComplete] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [filter, setFilter] = useState('');
  const refresh = useBridgeRefresh(
    () => window.vista.getState(),
    3000,
    setState,
    (cause) => setError(cause instanceof Error ? cause.message : 'Unable to load Vista state.'),
  );
  const run: Run = async (command) => {
    setBusy(true);
    setError('');
    try {
      await window.vista.command(command);
      await refresh();
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
  const nodes = [state.local, ...state.peers.flatMap((p) => (p.node ? [p.node] : []))];
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
  const discovery = { discovered, discover, discovering, discoveryComplete };
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
          <ScreensTab
            state={state}
            nodes={nodes}
            screens={screens}
            selection={selection}
            setSelection={setSelection}
            selectedNode={selectedNode}
            selectedScreen={selectedScreen}
            initial={initial}
            filter={filter}
            setFilter={setFilter}
            busy={busy}
            localControlled={localControlled}
            run={run}
            navigate={navigate}
            changeTab={changeTab}
            editorDirty={editorDirty}
            setEditorDirty={setEditorDirty}
          />
        )}
        {tab === 'sources' && <SourcesTab state={state} busy={busy} run={run} discovery={discovery} />}
        {tab === 'devices' && (
          <DevicesTab
            state={state}
            busy={busy}
            run={run}
            discovery={discovery}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
          />
        )}
      </main>
    </div>
  );
}
