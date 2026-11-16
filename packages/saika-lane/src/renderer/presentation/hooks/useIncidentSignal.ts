// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { errorMessage } from '@/renderer/presentation/utils/errorMessage';
import { mqttService } from '@/renderer/services/mqttService';

/**
 * State of one retained Lane incident signal (Range Officer request, possible malfunction, EST complaint):
 * read on mount and on each open, declared and cleared with a shared busy flag and error, and whether MQTT is
 * connected to publish it now. Reports whether the signal is active to the caller.
 */
export function useIncidentSignal<S extends { status: 'ACTIVE' | 'CLEARED' }>({
  isOpen,
  onActiveChange,
  get,
  idOf,
  clearById,
}: {
  isOpen: boolean;
  onActiveChange: (active: boolean) => void;
  get: () => Promise<S>;
  /** The identity the signal is cleared by; without one, clearing does nothing. */
  idOf: (signal: S) => string | null;
  clearById: (id: string) => Promise<S>;
}) {
  const [state, setState] = useState<S | null>(null);
  const [message, setMessage] = useState('');
  const [mqttConnected, setMqttConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [nextState, mqtt] = await Promise.all([get(), mqttService.getMqttStatus()]);
      setState(nextState);
      setMqttConnected(mqtt.status === 'connected');
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen]);

  /** Sends the declaration built by `send`, then re-reads the MQTT status. */
  const declare = async (send: () => Promise<S>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await send());
      const mqtt = await mqttService.getMqttStatus();
      setMqttConnected(mqtt.status === 'connected');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  /** Clears the signal by its identity and empties the draft message. */
  const clearSignal = async () => {
    const id = state ? idOf(state) : null;
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      setState(await clearById(id));
      setMessage('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const active = state?.status === 'ACTIVE' ? state : null;
  const isActive = active !== null;

  useEffect(() => {
    onActiveChange(isActive);
  }, [isActive, onActiveChange]);

  return { state, active, message, setMessage, mqttConnected, busy, error, declare, clear: clearSignal };
}
