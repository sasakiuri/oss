// SPDX-License-Identifier: MIT
import { BellRing, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { mqttService } from '@/renderer/services/mqttService';
import type { RangeOfficerRequestDto, RequestRangeOfficerInput } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';

const categories: Array<{ value: RequestRangeOfficerInput['category']; label: string }> = [
  { value: 'ASSISTANCE', label: 'General assistance' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'TARGET', label: 'Target' },
  { value: 'SCORING', label: 'Scoring' },
  { value: 'SAFETY', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other' },
];

export function RangeOfficerRequestControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<RangeOfficerRequestDto | null>(null);
  const [category, setCategory] = useState<RequestRangeOfficerInput['category']>('ASSISTANCE');
  const [message, setMessage] = useState('');
  const [mqttConnected, setMqttConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [nextState, mqtt] = await Promise.all([mqttService.getRangeOfficerRequest(), mqttService.getMqttStatus()]);
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

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await mqttService.requestRangeOfficer({ category, ...(message.trim() ? { message } : {}) });
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
    if (!state?.requestId) return;
    setBusy(true);
    setError(null);
    try {
      const next = await mqttService.clearRangeOfficerRequest({ requestId: state.requestId });
      setState(next);
      setMessage('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const active = state?.status === 'ACTIVE';

  return (
    <>
      <button
        type="button"
        className={`absolute right-4 top-4 z-30 flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-black tracking-wide shadow-xl transition-colors ${
          active
            ? 'animate-pulse border-amber-200 bg-amber-500 text-black'
            : 'border-amber-400 bg-zinc-950/90 text-amber-300 hover:bg-amber-950'
        }`}
        aria-label={active ? 'Range Officer request active' : 'Call Range Officer'}
        onClick={() => {
          setIsOpen(true);
          void refresh();
        }}
      >
        <BellRing size={20} /> {active ? 'RO REQUEST ACTIVE' : 'CALL RO'}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Range Officer request" className="max-w-lg">
        {active ? (
          <div className="space-y-4">
            <div className="rounded border border-amber-500 bg-amber-950/40 p-4">
              <p className="font-semibold text-amber-200">
                {categories.find((item) => item.value === state.category)?.label ?? state.category}
              </p>
              {state.message && <p className="mt-2 text-sm text-zinc-100">{state.message}</p>}
              {state.requestedAt && (
                <p className="mt-2 text-xs text-zinc-400">Requested {new Date(state.requestedAt).toLocaleString()}</p>
              )}
            </div>
            {!mqttConnected && (
              <p className="text-sm text-amber-300">
                Stored on this Lane. It will be published automatically after MQTT reconnects.
              </p>
            )}
            <p className="text-sm text-zinc-300">
              This assistance signal does not stop firing or change the competition timer.
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" disabled={busy} onClick={() => void clear()}>
                <CheckCircle2 className="mr-2 inline" size={18} /> {busy ? 'Clearing…' : 'Clear request'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-zinc-200">
              Reason
              <select
                className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-white"
                value={category}
                onChange={(event) => setCategory(event.target.value as RequestRangeOfficerInput['category'])}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-zinc-200">
              Details (optional)
              <textarea
                className="mt-1 min-h-24 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-white"
                maxLength={500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            {category === 'SAFETY' && (
              <p className="rounded border border-red-500 bg-red-950/40 p-3 text-sm text-red-200">
                This button calls an official but does not issue a STOP. Follow the range emergency procedure for an
                immediate danger.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void request()}>
                <BellRing className="mr-2 inline" size={18} /> {busy ? 'Requesting…' : 'Call Range Officer'}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </Modal>
    </>
  );
}
