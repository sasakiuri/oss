// SPDX-License-Identifier: MIT
/**
 * MqttSettingsTab component
 *
 * @description
 * MQTT tab component of the settings modal.
 * Manages connection settings to the MQTT broker.
 * - enabled: Enable/disable MQTT functionality
 * - brokerUrl: Broker URL
 * - laneAlias: Lane alias
 * - autoConnect: Auto connect
 * - laneId: Lane ID (read-only)
 * - Connect/Disconnect buttons
 * - Status display
 */

import React, { useCallback, useEffect, useState } from 'react';

import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';
import { mqttService } from '@/renderer/services/mqttService';

/**
 * MqttSettingsTab component
 */
export const MqttSettingsTab: React.FC = () => {
  const { status, error, isLoading, setStatus, setSettings, setError, setLoading } = useMqttStore();

  const [enabled, setEnabled] = useState(false);
  const [brokerUrl, setBrokerUrl] = useState('');
  const [laneAlias, setLaneAlias] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);
  const [laneId, setLaneId] = useState('');

  // Load settings
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        const [loadedSettings, mqttStatus] = await Promise.all([
          mqttService.getMqttSettings(),
          mqttService.getMqttStatus(),
        ]);
        if (controller.signal.aborted) return;

        setSettings(loadedSettings);
        setEnabled(loadedSettings.enabled);
        setBrokerUrl(loadedSettings.brokerUrl);
        setLaneAlias(loadedSettings.laneAlias);
        setAutoConnect(loadedSettings.autoConnect);
        setLaneId(loadedSettings.laneId);
        setStatus(mqttStatus.status);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [setSettings, setStatus, setError, setLoading]);

  const handleSave = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const newSettings = {
        enabled,
        brokerUrl,
        laneAlias,
        autoConnect,
        laneId,
      };
      await mqttService.saveMqttSettings(newSettings);
      setSettings(newSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, brokerUrl, laneAlias, autoConnect, laneId, setSettings, setError, setLoading]);

  const handleConnect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setStatus('connecting');
      await mqttService.connectMqtt({
        brokerUrl,
        laneAlias: laneAlias || undefined,
        autoConnect,
      });
      setStatus('connected');
    } catch (err) {
      setStatus('disconnected');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [brokerUrl, laneAlias, autoConnect, setStatus, setError, setLoading]);

  const handleDisconnect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await mqttService.disconnectMqtt();
      setStatus('disconnected');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [setStatus, setError, setLoading]);

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
      {error && (
        <div
          className="rounded-lg border border-red-500 bg-red-500/10 p-3 text-sm text-red-400"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
        >
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex justify-end gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="rounded bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save Settings
        </button>
        {isConnected ? (
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={isLoading || !enabled}
            className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
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
