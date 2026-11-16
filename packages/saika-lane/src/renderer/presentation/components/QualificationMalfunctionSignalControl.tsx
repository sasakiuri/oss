// SPDX-License-Identifier: MIT

import { CheckCircle2, TriangleAlert } from 'lucide-react';

import { useIncidentSignal } from '@/renderer/presentation/hooks/useIncidentSignal';
import { mqttService } from '@/renderer/services/mqttService';
import type { QualificationMalfunctionSignalDto } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';
import type { IncidentReportDialogProps } from './IncidentReportDialogProps';
import { IncidentSnapshot, StoredOnLaneNotice } from './IncidentSignalParts';

export function QualificationMalfunctionSignalControl({ isOpen, onClose, onActiveChange }: IncidentReportDialogProps) {
  const { active, message, setMessage, mqttConnected, busy, error, declare, clear } =
    useIncidentSignal<QualificationMalfunctionSignalDto>({
      isOpen,
      onActiveChange,
      get: () => mqttService.getQualificationMalfunctionSignal(),
      idOf: (signal) => signal.signalId,
      clearById: (signalId) => mqttService.clearQualificationMalfunctionSignal({ signalId }),
    });

  const declareMalfunction = () =>
    declare(() => {
      const normalizedMessage = message.trim();
      return mqttService.declareQualificationMalfunction({
        ...(normalizedMessage ? { message: normalizedMessage } : {}),
      });
    });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Possible firearm malfunction" className="max-w-xl">
      {active ? (
        <div className="space-y-4">
          <div className="rounded border border-red-500 bg-red-950/40 p-4" role="status" aria-live="assertive">
            <p className="font-semibold text-red-100">Official attention requested</p>
            {active.context && <IncidentSnapshot snapshot={active.context} />}
            {active.message && <p className="mt-3 text-sm text-zinc-100">{active.message}</p>}
            {active.signalledAt && (
              <p className="mt-2 text-xs text-zinc-400">Declared {new Date(active.signalledAt).toLocaleString()}</p>
            )}
          </div>
          {!mqttConnected && <StoredOnLaneNotice />}
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
            Declaring a possible malfunction does not stop firing or the timer and is not an official classification or
            claim decision.
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
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void declareMalfunction()}>
              <TriangleAlert className="mr-2 inline" size={18} />
              {busy ? 'Declaring…' : 'Declare possible malfunction'}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </Modal>
  );
}
