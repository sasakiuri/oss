// SPDX-License-Identifier: MIT
import { BellRing, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { useIncidentSignal } from '@/renderer/presentation/hooks/useIncidentSignal';
import { mqttService } from '@/renderer/services/mqttService';
import type { RangeOfficerRequestDto, RequestRangeOfficerInput } from '@/shared/ipc/contracts';

import { Button } from './common/Button';
import { Modal } from './common/Modal';
import type { IncidentReportDialogProps } from './IncidentReportDialogProps';
import { StoredOnLaneNotice } from './IncidentSignalParts';

const categories: Array<{ value: RequestRangeOfficerInput['category']; label: string }> = [
  { value: 'ASSISTANCE', label: 'General assistance' },
  { value: 'EQUIPMENT', label: 'Equipment' },
  { value: 'TARGET', label: 'Target' },
  { value: 'SCORING', label: 'Scoring' },
  { value: 'SAFETY', label: 'Safety concern' },
  { value: 'OTHER', label: 'Other' },
];

export function RangeOfficerRequestControl({ isOpen, onClose, onActiveChange }: IncidentReportDialogProps) {
  const [category, setCategory] = useState<RequestRangeOfficerInput['category']>('ASSISTANCE');
  const { active, message, setMessage, mqttConnected, busy, error, declare, clear } =
    useIncidentSignal<RangeOfficerRequestDto>({
      isOpen,
      onActiveChange,
      get: () => mqttService.getRangeOfficerRequest(),
      idOf: (request) => request.requestId,
      clearById: (requestId) => mqttService.clearRangeOfficerRequest({ requestId }),
    });

  // The Range Officer request keeps the message as typed; only a blank one is left out.
  const request = () =>
    declare(() => mqttService.requestRangeOfficer({ category, ...(message.trim() ? { message } : {}) }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Range Officer request" className="max-w-lg">
      {active ? (
        <div className="space-y-4">
          <div className="rounded border border-amber-500 bg-amber-950/40 p-4">
            <p className="font-semibold text-amber-200">
              {categories.find((item) => item.value === active.category)?.label ?? active.category}
            </p>
            {active.message && <p className="mt-2 text-sm text-zinc-100">{active.message}</p>}
            {active.requestedAt && (
              <p className="mt-2 text-xs text-zinc-400">Requested {new Date(active.requestedAt).toLocaleString()}</p>
            )}
          </div>
          {!mqttConnected && <StoredOnLaneNotice />}
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
            <Button variant="secondary" disabled={busy} onClick={onClose}>
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
  );
}
