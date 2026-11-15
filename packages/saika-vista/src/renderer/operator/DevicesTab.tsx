// SPDX-License-Identifier: MIT
import type { AppState } from '../../shared/model';
import { UpdateControls } from '../UpdateControls';

import { PairingForm, type DiscoveryProps } from './PairingForm';
import { StatusPill } from './StatusPill';
import type { Run } from './types';

export function DevicesTab({
  state,
  busy,
  run,
  discovery,
  showSecret,
  setShowSecret,
}: {
  state: AppState;
  busy: boolean;
  run: Run;
  discovery: DiscoveryProps;
  showSecret: boolean;
  setShowSecret: (show: boolean) => void;
}) {
  return (
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
      <PairingForm kind="peer" run={run} busy={busy} {...discovery} />
    </div>
  );
}
