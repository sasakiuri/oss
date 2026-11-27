// SPDX-License-Identifier: MIT
/** Edits broker settings and controls the MQTT connection. */

import React from 'react';

import { ErrorAlert } from '@/renderer/presentation/components/common/ErrorAlert';
import { useMqttSettings } from '@/renderer/presentation/hooks/useMqttSettings';

export const MqttSettingsTab: React.FC = () => {
  const {
    enabled,
    setEnabled,
    brokerUrl,
    setBrokerUrl,
    laneAlias,
    setLaneAlias,
    autoConnect,
    setAutoConnect,
    laneId,
    status,
    error,
    isLoading,
    save,
    connect,
    disconnect,
  } = useMqttSettings();

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Enabled toggle */}
      <div className="flex items-center justify-between">
        <label htmlFor="mqtt-enabled" className="text-sm font-medium text-zinc-300">
          Enable MQTT
        </label>
        <input
          id="mqtt-enabled"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 accent-blue-500"
        />
      </div>

      {/* Broker URL */}
      <div className="flex flex-col gap-1">
        <label htmlFor="mqtt-broker-url" className="text-sm font-medium text-zinc-300">
          Broker URL
        </label>
        <input
          id="mqtt-broker-url"
          type="text"
          value={brokerUrl}
          onChange={(e) => setBrokerUrl(e.target.value)}
          placeholder="mqtt://broker.example.com:1883"
          disabled={!enabled}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
        <span className="text-xs text-zinc-400">
          Use mqtts:// for encrypted connections in production environments.
        </span>
      </div>

      {/* Lane Alias */}
      <div className="flex flex-col gap-1">
        <label htmlFor="mqtt-lane-alias" className="text-sm font-medium text-zinc-300">
          Lane Alias
        </label>
        <input
          id="mqtt-lane-alias"
          type="text"
          value={laneAlias}
          onChange={(e) => setLaneAlias(e.target.value)}
          placeholder="Lane 1"
          disabled={!enabled}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      {/* Auto Connect */}
      <div className="flex items-center justify-between">
        <label htmlFor="mqtt-auto-connect" className="text-sm font-medium text-zinc-300">
          Auto Connect
        </label>
        <input
          id="mqtt-auto-connect"
          type="checkbox"
          checked={autoConnect}
          onChange={(e) => setAutoConnect(e.target.checked)}
          disabled={!enabled}
          className="h-4 w-4 accent-blue-500 disabled:opacity-50"
        />
      </div>

      {/* Lane ID (readonly) */}
      <div className="flex flex-col gap-1">
        <label htmlFor="mqtt-lane-id" className="text-sm font-medium text-zinc-300">
          Lane ID
        </label>
        <input
          id="mqtt-lane-id"
          type="text"
          value={laneId}
          readOnly
          className="cursor-not-allowed rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-500"
        />
        <span className="text-xs text-zinc-400">Auto-generated UUID (read-only)</span>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-300">Status:</span>
        <span
          className={`text-sm font-medium ${
            isConnected ? 'text-green-400' : isConnecting ? 'text-yellow-400' : 'text-zinc-400'
          }`}
        >
          {status}
        </span>
      </div>

      {/* Error display */}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      {/* Action buttons */}
      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isLoading}
          className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Settings
        </button>
        {isConnected ? (
          <button
            type="button"
            onClick={disconnect}
            disabled={isLoading || !enabled}
            className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={connect}
            disabled={isLoading || !enabled || !brokerUrl}
            className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
};
