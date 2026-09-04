// SPDX-License-Identifier: MIT

import { CheckCircle2, MonitorX } from 'lucide-react';
import { useEffect, useState } from 'react';

import { mqttService } from '@/renderer/services/mqttService';
import type { DeclareEstComplaintInput, EstComplaintSignalDto } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';

const issues: Array<{ value: DeclareEstComplaintInput['issue']; label: string }> = [
  { value: 'SHOT_VALUE', label: 'Displayed shot value' },
  { value: 'SHOT_NOT_REGISTERED', label: 'Shot not registered or displayed' },
  { value: 'TARGET_FAILURE', label: 'Target failure' },
  { value: 'TARGET_MEDIA_ADVANCE', label: 'Paper or rubber strip advance' },
  { value: 'OTHER', label: 'Other EST issue' },
];

export function EstComplaintSignalControl() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<EstComplaintSignalDto | null>(null);
  const [issue, setIssue] = useState<DeclareEstComplaintInput['issue']>('SHOT_VALUE');
  const [message, setMessage] = useState('');
  const [mqttConnected, setMqttConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const [nextState, mqtt] = await Promise.all([mqttService.getEstComplaintSignal(), mqttService.getMqttStatus()]);
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
      const next = await mqttService.declareEstComplaint({
        issue,
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
      const next = await mqttService.clearEstComplaintSignal({ signalId: state.signalId });
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
  const issueLabel = issues.find((item) => item.value === state?.issue)?.label ?? state?.issue;

  return (
    <>
      <button
        type="button"
        className={`absolute right-4 top-28 z-30 flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-black tracking-wide shadow-xl transition-colors ${
          active
            ? 'animate-pulse border-cyan-100 bg-cyan-600 text-white'
            : 'border-cyan-400 bg-zinc-950/90 text-cyan-300 hover:bg-cyan-950'
        }`}
        aria-label={active ? 'EST complaint active' : 'Raise an EST complaint'}
        onClick={() => {
          setIsOpen(true);
          void refresh();
        }}
      >
        <MonitorX size={20} /> {active ? 'EST COMPLAINT ACTIVE' : 'EST COMPLAINT'}
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Electronic target complaint" className="max-w-xl">
        {active ? (
          <div className="space-y-4">
            <div className="rounded border border-cyan-500 bg-cyan-950/40 p-4" role="status" aria-live="assertive">
              <p className="font-semibold text-cyan-100">{issueLabel}</p>
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
                  {snapshot.lastShot && (
                    <>
                      <dt className="text-zinc-400">Last recorded shot</dt>
                      <dd>
                        #{snapshot.lastShot.shotNumberInSeries} at{' '}
                        {new Date(snapshot.lastShot.receivedAt).toLocaleTimeString()}
                      </dd>
                    </>
                  )}
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
                <p className="mt-2 text-xs text-zinc-400">Raised {new Date(state.signalledAt).toLocaleString()}</p>
              )}
            </div>
            {!mqttConnected && (
              <p className="text-sm text-amber-300">
                Stored on this Lane. It will be published automatically after MQTT reconnects.
              </p>
            )}
            <p className="rounded border border-amber-500 bg-amber-950/40 p-3 text-sm text-amber-100">
              Wait for the Range Officer and do not fire another shot unless instructed. This signal does not decide
              whether the complaint is timely or valid and does not change a score or timer.
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
            <p className="rounded border border-cyan-500 bg-cyan-950/40 p-3 text-sm text-cyan-100">
              Raise the complaint immediately and wait for the Range Officer. Saika will capture the current athlete,
              competition position, shot count, and latest recorded shot for official review.
            </p>
            <label className="block text-sm font-medium text-zinc-200">
              Complaint
              <select
                className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-white"
                value={issue}
                onChange={(event) => setIssue(event.target.value as DeclareEstComplaintInput['issue'])}
              >
                {issues.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-zinc-200">
              Observation (optional)
              <textarea
                className="mt-1 min-h-24 w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-white"
                maxLength={500}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
            </label>
            <p className="text-sm text-zinc-300">
              This observation is not a Jury decision and does not change a score, stop firing, or alter the timer.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button disabled={busy} onClick={() => void declare()}>
                <MonitorX className="mr-2 inline" size={18} /> {busy ? 'Raising…' : 'Raise EST complaint'}
              </Button>
            </div>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </Modal>
    </>
  );
}
