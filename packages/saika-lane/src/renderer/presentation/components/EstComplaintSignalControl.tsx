// SPDX-License-Identifier: MIT

import { findEstComplaintProcedure, missingShotComplaintGuidance } from '@sasakiuri/saika-rules';
import { CheckCircle2, MonitorX } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useIncidentSignal } from '@/renderer/presentation/hooks/useIncidentSignal';
import { mqttService } from '@/renderer/services/mqttService';
import type { DeclareEstComplaintInput, EstComplaintContextDto, EstComplaintSignalDto } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';
import type { IncidentReportDialogProps } from './IncidentReportDialogProps';
import { IncidentSnapshot, StoredOnLaneNotice } from './IncidentSignalParts';

const issues: Array<{ value: DeclareEstComplaintInput['issue']; label: string }> = [
  { value: 'SHOT_VALUE', label: 'Displayed shot value' },
  { value: 'SHOT_NOT_REGISTERED', label: 'Shot missing or unexpected zero' },
  { value: 'TARGET_FAILURE', label: 'Target failure' },
  { value: 'TARGET_MEDIA_ADVANCE', label: 'Paper or rubber strip advance' },
  { value: 'OTHER', label: 'Other EST issue' },
];

export function EstComplaintSignalControl({ isOpen, onClose, onActiveChange }: IncidentReportDialogProps) {
  const { state, active, message, setMessage, mqttConnected, busy, error, declare, clear } =
    useIncidentSignal<EstComplaintSignalDto>({
      isOpen,
      onActiveChange,
      get: () => mqttService.getEstComplaintSignal(),
      idOf: (signal) => signal.signalId,
      clearById: (signalId) => mqttService.clearEstComplaintSignal({ signalId }),
    });
  const [issue, setIssue] = useState<DeclareEstComplaintInput['issue']>('SHOT_VALUE');
  const [preview, setPreview] = useState<EstComplaintContextDto | null>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    if (!isOpen || state?.status === 'ACTIVE') return;
    let disposed = false;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const context = await mqttService.getEstComplaintContext();
        if (!disposed) {
          setPreview(context);
          setPreviewUnavailable(false);
        }
      } catch {
        if (!disposed) {
          setPreview(null);
          setPreviewUnavailable(true);
        }
      } finally {
        pending = false;
      }
    };
    setPreview(null);
    void load();
    const timer = setInterval(() => void load(), 1_000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [isOpen, state?.status]);

  const raiseComplaint = () =>
    declare(() => {
      const normalizedMessage = message.trim();
      return mqttService.declareEstComplaint({
        issue,
        ...(normalizedMessage ? { message: normalizedMessage } : {}),
      });
    });

  const snapshot = active?.context;
  const issueLabel = issues.find((item) => item.value === active?.issue)?.label ?? active?.issue;
  const displayedIssue = active ? active.issue : issue;
  const displayedContext = active ? snapshot : preview;
  const procedure = displayedContext?.missingShotProcedure;
  const ruleProcedure =
    displayedContext &&
    displayedIssue &&
    findEstComplaintProcedure(displayedContext.rules, displayedContext.phase, displayedIssue);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Electronic target complaint" className="max-w-xl">
      {ruleProcedure && (
        <p className="mb-4 rounded border border-cyan-500 bg-cyan-950/40 p-3 text-sm text-cyan-100" role="status">
          {ruleProcedure.athleteGuidance} ({ruleProcedure.ruleReference})
        </p>
      )}
      {!ruleProcedure && displayedIssue === 'SHOT_NOT_REGISTERED' && procedure && (
        <p className="mb-4 rounded border border-cyan-500 bg-cyan-950/40 p-3 text-sm text-cyan-100" role="status">
          ISSF {procedure.ruleReference}: {missingShotComplaintGuidance(procedure)}
        </p>
      )}
      {!active && previewUnavailable && (
        <p className="mb-4 text-sm text-amber-300">
          The current event procedure is unavailable. Confirm the procedure with the Range Officer.
        </p>
      )}
      {active ? (
        <div className="space-y-4">
          <div className="rounded border border-cyan-500 bg-cyan-950/40 p-4" role="status" aria-live="assertive">
            <p className="font-semibold text-cyan-100">{issueLabel}</p>
            {snapshot && <IncidentSnapshot snapshot={snapshot} lastShot={snapshot.lastShot} />}
            {active.message && <p className="mt-3 text-sm text-zinc-100">{active.message}</p>}
            {active.signalledAt && (
              <p className="mt-2 text-xs text-zinc-400">Raised {new Date(active.signalledAt).toLocaleString()}</p>
            )}
          </div>
          {!mqttConnected && <StoredOnLaneNotice />}
          <p className="rounded border border-amber-500 bg-amber-950/40 p-3 text-sm text-amber-100">
            Follow range commands, including STOP and UNLOAD. This signal does not decide whether the complaint is
            timely or valid and does not change a score or timer.
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
            Follow the applicable complaint procedure. Saika will capture the current athlete, competition position,
            shot count, and latest recorded shot for official review.
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
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void raiseComplaint()}>
              <MonitorX className="mr-2 inline" size={18} /> {busy ? 'Raising…' : 'Raise EST complaint'}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </Modal>
  );
}
