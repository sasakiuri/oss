// SPDX-License-Identifier: MIT

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { mqttService } from '@/renderer/services/mqttService';
import type { QualificationMalfunctionSignalDto } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';

export function QualificationMalfunctionSignalControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<QualificationMalfunctionSignalDto | null>(null);
  const [message, setMessage] = useState('');
  const [mqttConnected, setMqttConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [nextState, mqtt] = await Promise.all([
        mqttService.getQualificationMalfunctionSignal(),
        mqttService.getMqttStatus(),
      ]);
      setState(nextState);
      setMqttConnected(mqtt.status === 'connected');
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const declare = async () => {
    setBusy(true);
    setError(null);
    try {
      const normalizedMessage = message.trim();
      const next = await mqttService.declareQualificationMalfunction({
        ...(normalizedMessage ? { message: normalizedMessage } : {}),
      });
      setState(next);
      const mqtt = await mqttService.getMqttStatus();
      setMqttConnected(mqtt.status === 'connected');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!state?.signalId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await mqttService.clearQualificationMalfunctionSignal({ signalId: state.signalId });
      setState(next);
      setMessage('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const active = state?.status === 'ACTIVE';
  const snapshot = state?.context;

  return (
    <>
      <button
        type="button"
        className={`absolute right-4 top-16 z-30 flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-black tracking-wide shadow-xl transition-colors ${
          active
            ? 'animate-pulse border-red-100 bg-red-600 text-white'
            : 'border-red-400 bg-zinc-950/90 text-red-300 hover:bg-red-950'
        }`}
        aria-label={active ? 'Qualification malfunction declaration active' : 'Declare a possible malfunction'}
        onClick={() => {
          setIsOpen(true);
          void refresh();
        }}
      >
        <TriangleAlert size={20} /> {active ? 'MALFUNCTION ACTIVE' : 'DECLARE MALFUNCTION'}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Possible firearm malfunction" className="max-w-xl">
        {active ? (
          <div className="space-y-4">
            <div className="rounded border border-red-500 bg-red-950/40 p-4" role="status" aria-live="assertive">
              <p className="font-semibold text-red-100">Official attention requested</p>
              {snapshot && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-zinc-200">
                  <dt className="text-zinc-400">Athlete</dt>
                  <dd>
                    {snapshot.startNumber ? `#${snapshot.startNumber} ` : ''}
                    {snapshot.participantName}
                  </dd>
                  <dt className="text-zinc-400">Position</dt>
                  <dd>
                    {snapshot.phase}, stage {snapshot.stageIndex + 1}, series {snapshot.seriesIndex + 1}
                  </dd>
                  <dt className="text-zinc-400">Shots recorded</dt>
                  <dd>
                    {snapshot.recordedShots}
                    {snapshot.seriesShotLimit === null ? '' : ` / ${snapshot.seriesShotLimit}`}
                  </dd>
                  {snapshot.exposureIndex !== null && (
                    <>
                      <dt className="text-zinc-400">Exposure</dt>
                      <dd>{snapshot.exposureIndex + 1}</dd>
                    </>
                  )}
                </dl>
              )}
              {state.message && <p className="mt-3 text-sm text-zinc-100">{state.message}</p>}
              {state.signalledAt && (
                <p className="mt-2 text-xs text-zinc-400">Declared {new Date(state.signalledAt).toLocaleString()}</p>
              )}
            </div>
            {!mqttConnected && (
              <p className="text-sm text-amber-300">
                Stored on this Lane. It will be published automatically after MQTT reconnects.
              </p>
            )}
            <p className="rounded border border-amber-500 bg-amber-950/40 p-3 text-sm text-amber-100">
              Keep the firearm pointed safely downrange and wait for the Range Officer. This declaration does not stop
              firing, alter the timer, classify the malfunction, or award a claim.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => void clear()}>
                <CheckCircle2 className="mr-2 inline" size={18} />
                {busy ? 'Clearing…' : 'Clear after official acknowledgement'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="rounded border border-red-500 bg-red-950/40 p-3 text-sm text-red-100">
              Keep the firearm pointed safely downrange and inform the Range Officer. Saika will capture the current
              athlete, competition, stage, series, shot count, and timed-target exposure for official review.
            </p>
            <p className="text-sm text-zinc-300">
              Declaring a possible malfunction does not stop firing or the timer and is not an official classification
              or claim decision.
            </p>
            <label className="block text-sm font-medium text-zinc-200">
              Observation (optional)
              <textarea
                className="mt-1 min-h-24 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-white"
                maxLength={500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={busy} onClick={() => void declare()}>
                <TriangleAlert className="mr-2 inline" size={18} />
                {busy ? 'Declaring…' : 'Declare possible malfunction'}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </Modal>
    </>
  );
}
