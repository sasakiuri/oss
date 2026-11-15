// SPDX-License-Identifier: MIT
import type { AppState } from '../../shared/model';

import { PairingForm, type DiscoveryProps } from './PairingForm';
import { StatusPill } from './StatusPill';
import type { Run } from './types';

export function SourcesTab({
  state,
  busy,
  run,
  discovery,
}: {
  state: AppState;
  busy: boolean;
  run: Run;
  discovery: DiscoveryProps;
}) {
  return (
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
                {source.state === 'connected' ? 'Connected' : source.state === 'connecting' ? 'Connecting' : 'Offline'}
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
      <PairingForm kind="source" run={run} busy={busy} {...discovery} />
    </div>
  );
}
