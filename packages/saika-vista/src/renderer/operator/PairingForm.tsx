// SPDX-License-Identifier: MIT
import { useState } from 'react';

import type { Discovery } from '../../shared/model';

import type { Run } from './types';

/** Discovery results shared by the source and display PC pairing forms. */
export type DiscoveryProps = {
  discovered: Discovery[];
  discover: () => Promise<void>;
  discovering: boolean;
  discoveryComplete: boolean;
};
export function PairingForm({
  kind,
  run,
  busy,
  discovered,
  discover,
  discovering,
  discoveryComplete,
}: { kind: 'source' | 'peer'; run: Run; busy: boolean } & DiscoveryProps) {
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
