// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import { useBusyAction } from '@/renderer/presentation/hooks/useBusyAction';
import { mqttService } from '@/renderer/services/mqttService';
import { errorMessage } from '@/shared/errors/errorMessage';

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
  const { busy, error, setError, run } = useBusyAction();
  /** Bumped by every read and every applied command result, so an older read cannot overwrite a newer state. */
  const generation = useRef(0);
  const mounted = useRef(false);

  const refresh = async () => {
    const request = ++generation.current;
    try {
      const [nextState, mqtt] = await Promise.all([get(), mqttService.getMqttStatus()]);
      if (request !== generation.current) return;
      setState(nextState);
      setMqttConnected(mqtt.status === 'connected');
      setError(null);
    } catch (caught) {
      if (request === generation.current) setError(errorMessage(caught));
    }
  };

  // Read on mount and on each later open.
  useEffect(() => {
    if (isOpen || !mounted.current) void refresh();
    mounted.current = true;
  }, [isOpen]);

  const applyResult = (next: S) => {
    generation.current += 1;
    setState(next);
  };

  /** Sends the declaration built by `send`, then re-reads the MQTT status. */
  const declare = (send: () => Promise<S>) =>
    run(async () => {
      applyResult(await send());
      const mqtt = await mqttService.getMqttStatus();
      setMqttConnected(mqtt.status === 'connected');
    });

  /** Clears the signal by its identity and empties the draft message. */
  const clearSignal = async () => {
    const id = state ? idOf(state) : null;
    if (!id) return;
    await run(async () => {
      applyResult(await clearById(id));
      setMessage('');
    });
  };

  const active = state?.status === 'ACTIVE' ? state : null;
  const isActive = active !== null;

  useEffect(() => {
    onActiveChange(isActive);
  }, [isActive, onActiveChange]);

  return { state, active, message, setMessage, mqttConnected, busy, error, declare, clear: clearSignal };
}
