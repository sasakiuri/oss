import { Copy, RefreshCw } from 'lucide-react';

import { Button } from '../shared/common/Button';
import { Input } from '../shared/common/Input';

import type { NetworkSettings } from './useSettingsScreen';

interface NetworkSettingsPanelProps {
  /** True until the screen's initial settings queries settled. */
  loading: boolean;
  network: NetworkSettings;
}

/** MQTT broker mode, Lane connection URLs, external broker URL and connection status. */
export function NetworkSettingsPanel({ loading, network }: NetworkSettingsPanelProps) {
  const {
    brokerMode,
    brokerUrl,
    brokerStatus,
    saving,
    refreshing,
    selectExternalMode,
    setBrokerUrl,
    refreshStatus,
    copyConnectionUrl,
    enableEmbeddedBroker,
    saveExternalConfig,
  } = network;

  return (
    <section aria-labelledby="mqtt-broker-heading" className="border-t border-vscode-border">
      <div className="border-b border-vscode-border py-3">
        <h3 id="mqtt-broker-heading" className="text-sm font-semibold text-vscode-text">
          MQTT broker
        </h3>
      </div>

      <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h4 id="broker-mode-heading" className="text-[13px] font-medium text-vscode-text">
            Broker mode
          </h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Run the broker here or connect to an existing one.
          </p>
        </div>

        <div
          role="group"
          aria-labelledby="broker-mode-heading"
          className="grid max-w-xl grid-cols-2 overflow-hidden rounded-[3px] border border-vscode-border"
        >
          <button
            type="button"
            disabled={loading || saving}
            onClick={enableEmbeddedBroker}
            aria-label="Embedded"
            aria-pressed={brokerMode === 'embedded'}
            className={`flex min-h-12 items-center gap-2.5 border-r border-vscode-border px-3 py-2 text-left transition-colors disabled:opacity-50 ${
              brokerMode === 'embedded'
                ? 'bg-vscode-highlight text-vscode-text'
                : 'text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                brokerMode === 'embedded' ? 'border-vscode-primary' : 'border-vscode-dimmed'
              }`}
            >
              {brokerMode === 'embedded' && <span className="h-1.5 w-1.5 rounded-full bg-vscode-primary" />}
            </span>
            <span>
              <span className="block text-[13px] font-medium">Embedded</span>
              <span className="block text-[11px] text-vscode-text-muted">This computer</span>
            </span>
          </button>
          <button
            type="button"
            disabled={loading || saving}
            onClick={selectExternalMode}
            aria-label="External"
            aria-pressed={brokerMode === 'external'}
            className={`flex min-h-12 items-center gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-50 ${
              brokerMode === 'external'
                ? 'bg-vscode-highlight text-vscode-text'
                : 'text-vscode-text-muted hover:bg-vscode-hover hover:text-vscode-text'
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                brokerMode === 'external' ? 'border-vscode-primary' : 'border-vscode-dimmed'
              }`}
            >
              {brokerMode === 'external' && <span className="h-1.5 w-1.5 rounded-full bg-vscode-primary" />}
            </span>
            <span>
              <span className="block text-[13px] font-medium">External</span>
              <span className="block text-[11px] text-vscode-text-muted">MQTT URL</span>
            </span>
          </button>
        </div>
      </div>

      {brokerMode === 'embedded' && brokerStatus.localAddresses.length > 0 && (
        <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div>
            <h4 className="text-[13px] font-medium text-vscode-text">Lane connection URLs</h4>
            <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Use one on each Saika Lane device.</p>
          </div>
          <div className="grid max-w-xl gap-1.5">
            {brokerStatus.localAddresses.map((addr) => {
              const url = `mqtt://${addr}:${brokerStatus.brokerPort}`;
              return (
                <div
                  key={addr}
                  className="flex min-w-0 items-center rounded-[3px] border border-vscode-border bg-vscode-input"
                >
                  <code className="min-w-0 flex-1 truncate px-2.5 py-2 font-mono text-[13px] text-vscode-accent">
                    {url}
                  </code>
                  <button
                    type="button"
                    aria-label={`Copy ${url}`}
                    title="Copy connection URL"
                    onClick={() => void copyConnectionUrl(url)}
                    className="flex h-8 w-9 shrink-0 items-center justify-center border-l border-vscode-border text-vscode-text-muted transition-colors hover:bg-vscode-hover hover:text-vscode-text"
                  >
                    <Copy size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {brokerMode === 'external' && (
        <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
          <div>
            <h4 className="text-[13px] font-medium text-vscode-text">External broker</h4>
            <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Complete MQTT or MQTTS URL.</p>
          </div>
          <div className="max-w-xl space-y-3">
            <Input label="Broker URL" value={brokerUrl} onChange={setBrokerUrl} placeholder="mqtt://localhost:1883" />
            <Button variant="primary" size="sm" disabled={!brokerUrl.trim() || saving} onClick={saveExternalConfig}>
              {saving ? 'Connecting…' : 'Save and connect'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 border-b border-vscode-border py-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div>
          <h4 id="connection-status-heading" className="text-[13px] font-medium text-vscode-text">
            Connection status
          </h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">Broker and Director client.</p>
        </div>
        <section aria-labelledby="connection-status-heading" className="max-w-xl">
          <div className="mb-2 flex justify-end">
            <Button variant="secondary" size="sm" disabled={refreshing} onClick={() => void refreshStatus()}>
              <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Checking…' : 'Refresh'}
            </Button>
          </div>

          <dl className="divide-y divide-vscode-border border-y border-vscode-border">
            <div className="flex items-center justify-between gap-4 px-1 py-2.5">
              <dt className="text-[13px] text-vscode-text">Broker service</dt>
              <dd
                className={`inline-flex items-center gap-1.5 text-xs ${
                  brokerStatus.brokerRunning ? 'text-vscode-success' : 'text-vscode-text-muted'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    brokerStatus.brokerRunning ? 'bg-vscode-success' : 'bg-vscode-dimmed'
                  }`}
                />
                {brokerStatus.brokerRunning ? 'Running' : 'Stopped'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 px-1 py-2.5">
              <dt className="text-[13px] text-vscode-text">Director client</dt>
              <dd
                className={`inline-flex items-center gap-1.5 text-xs ${
                  brokerStatus.clientConnected ? 'text-vscode-success' : 'text-vscode-text-muted'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    brokerStatus.clientConnected ? 'bg-vscode-success' : 'bg-vscode-dimmed'
                  }`}
                />
                {brokerStatus.clientConnected ? 'Connected' : 'Disconnected'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
