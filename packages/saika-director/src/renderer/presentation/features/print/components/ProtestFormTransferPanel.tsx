import { useState } from 'react';

import { createProtestFormTransfer } from '@/shared/forms/ProtestFormTransfer';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { ProtestOfficialFormPanel } from './ProtestOfficialFormPanel';

export function ProtestFormTransferPanel({
  protest,
  parent,
}: {
  protest: ProtestCaseDto;
  parent: ProtestCaseDto | null;
}) {
  const [timeZone, setTimeZone] = useState('UTC');
  const [eventName, setEventName] = useState('');
  const [juryName, setJuryName] = useState('');
  const [nation, setNation] = useState('');
  const [receivingOfficial, setReceivingOfficial] = useState('');
  const [copyError, setCopyError] = useState<string | null>(null);
  if (protest.kind !== 'WRITTEN' && protest.kind !== 'APPEAL') return null;
  if (protest.status === 'VOID') return null;
  let transfer;
  let error: string | null = null;
  try {
    transfer = createProtestFormTransfer(protest, { timeZone, parent, eventName, juryName, nation, receivingOfficial });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Unable to prepare form values';
  }
  const copy = async (value: string) => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setCopyError('Clipboard unavailable. Select and copy the displayed value manually.');
    }
  };
  return (
    <details className="no-print my-4 rounded border p-4">
      <summary className="cursor-pointer font-semibold">Transfer values to a protest or appeal form</summary>
      <p className="my-2">
        Review each value before copying it into the official form. Signatures, meeting and notification details need
        separate completion. An outcome of partly upheld requires manual review.
      </p>
      <p>These entries are temporary and do not change the protest record.</p>
      <div className="my-3 grid gap-2 md:grid-cols-2">
        <label>
          Time zone (IANA, e.g. Asia/Tokyo)
          <input className={inputClass} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
        </label>
        {protest.kind === 'WRITTEN' ? (
          <>
            <label>
              Event for transfer
              <input className={inputClass} value={eventName} onChange={(e) => setEventName(e.target.value)} />
            </label>
            <label>
              Jury for transfer
              <input className={inputClass} value={juryName} onChange={(e) => setJuryName(e.target.value)} />
            </label>
          </>
        ) : (
          <label>
            Nation for transfer
            <input className={inputClass} value={nation} onChange={(e) => setNation(e.target.value)} />
          </label>
        )}
        <label>
          Receiving official for transfer
          <input
            className={inputClass}
            value={receivingOfficial}
            onChange={(e) => setReceivingOfficial(e.target.value)}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {copyError && <p role="alert">{copyError}</p>}
      {transfer && (
        <>
          <p>
            Form {transfer.code} · Record {transfer.caseId} · {transfer.status} · Times in {transfer.timeZone}
          </p>
          {transfer.attachment && (
            <p className="my-2">
              Attach the original official protest form:{' '}
              {transfer.attachment.formReference ?? 'Form reference not recorded'} (record {transfer.attachment.caseId}
              ). The operational printout does not replace that attachment.
            </p>
          )}
          <ProtestOfficialFormPanel key={transfer.caseId} transfer={transfer} />
          <div className="mt-3 space-y-2">
            {transfer.fields.map((field) => (
              <div key={field.label} className="rounded border p-2">
                <label className="block">
                  {field.label}
                  <textarea
                    className={inputClass}
                    readOnly
                    value={field.value ?? ''}
                    placeholder="Complete manually"
                    rows={2}
                  />
                </label>
                <span className="mr-3 text-sm">
                  {field.origin === 'record'
                    ? 'From the record'
                    : field.origin === 'entered'
                      ? 'Entered for this transfer'
                      : 'Complete manually'}
                </span>
                <button
                  type="button"
                  className="rounded border px-2 py-1 disabled:opacity-50"
                  aria-label={`Copy ${field.label}`}
                  disabled={field.value === null}
                  onClick={() => void copy(field.value!)}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}

const inputClass = 'block w-full rounded border p-2 text-black bg-white';
