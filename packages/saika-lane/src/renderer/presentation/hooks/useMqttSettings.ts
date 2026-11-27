// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

import { useMqttStore } from '@/renderer/presentation/stores/mqttStore';
import { mqttService } from '@/renderer/services/mqttService';
import { errorMessage } from '@/shared/errors/errorMessage';

/**
 * The broker settings form and the MQTT connection: loads the saved settings and status on mount, follows
 * status events, and saves, connects and disconnects with the shared loading flag and error.
 */
export function useMqttSettings() {
  const { status, error, isLoading, setStatus, setError, setLoading } = useMqttStore();

  const [enabled, setEnabled] = useState(false);
  const [brokerUrl, setBrokerUrl] = useState('');
  const [laneAlias, setLaneAlias] = useState('');
  const [autoConnect, setAutoConnect] = useState(false);
  const [laneId, setLaneId] = useState('');
  /** Counts status events, so the initial query cannot overwrite a status pushed while it was pending. */
  const statusEvents = useRef(0);

  useEffect(
    () =>
      window.electronAPI.on.mqttStatusChanged((next) => {
        statusEvents.current += 1;
        setStatus(next.status);
        setError(next.error ?? null);
      }),
    [setStatus, setError],
  );

  // Load settings
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      const queriedAfterEvent = statusEvents.current;
      try {
        setLoading(true);
        const [loadedSettings, mqttStatus] = await Promise.all([
          mqttService.getMqttSettings(),
          mqttService.getMqttStatus(),
        ]);
        if (controller.signal.aborted) return;

        setEnabled(loadedSettings.enabled);
        setBrokerUrl(loadedSettings.brokerUrl);
        setLaneAlias(loadedSettings.laneAlias);
        setAutoConnect(loadedSettings.autoConnect);
        setLaneId(loadedSettings.laneId);
        if (statusEvents.current === queriedAfterEvent) {
          setStatus(mqttStatus.status);
          setError(mqttStatus.error ?? null);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(errorMessage(err));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, [setStatus, setError, setLoading]);

  const save = useCallback(async () => {
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
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, brokerUrl, laneAlias, autoConnect, laneId, setError, setLoading]);

  const connect = useCallback(async () => {
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
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [brokerUrl, laneAlias, autoConnect, setStatus, setError, setLoading]);

  const disconnect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await mqttService.disconnectMqtt();
      setStatus('disconnected');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setStatus, setError, setLoading]);

  return {
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
  };
}
