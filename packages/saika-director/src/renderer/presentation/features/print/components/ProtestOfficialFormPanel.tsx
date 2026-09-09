import { useState } from 'react';

import {
  assessProtestFormDraft,
  createProtestFormDraft,
  type ProtestFormPhase,
  type ProtestFormTransfer,
} from '@/shared/forms/ProtestFormDraft';

export function ProtestOfficialFormPanel({ transfer }: { transfer: ProtestFormTransfer }) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<ProtestFormPhase>('SUBMISSION');
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const [attachmentsText, setAttachmentsText] = useState('');
  const [template, setTemplate] = useState<File | null>(null);
  const [font, setFont] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = createProtestFormDraft(transfer, overrides);
  const attachments = [
    ...new Set(
      attachmentsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  const fingerprint = JSON.stringify({ draft, attachments });
  const checked = new Set(
    Object.entries(confirmations)
      .filter(([, value]) => value === fingerprint)
      .map(([key]) => key),
  );
  const issues = assessProtestFormDraft(draft, phase, checked, attachments);
  const checks = [
    ...draft.signatures.map((signature) => ({
      id: signature.id,
      label: `${signature.label} present on the signed form (${signature.phase.toLowerCase()})`,
    })),
    ...(draft.attachment
      ? [
          {
            id: 'original-protest',
            label: `Original official Protest Form P attached: ${draft.attachment.formReference ?? draft.attachment.caseId}`,
          },
        ]
      : []),
    ...attachments.map((reference) => ({ id: `attachment:${reference}`, label: `Attachment present: ${reference}` })),
  ];
  const exportPdf = async () => {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      if (template.size > 5 * 1024 * 1024 || (font && font.size > 30 * 1024 * 1024))
        throw new Error('Select a form up to 5 MB and a font up to 30 MB.');
      const { fillProtestPdf } = await import('@/renderer/infrastructure/forms/ProtestPdfWriter');
      const bytes = await fillProtestPdf(
        new Uint8Array(await template.arrayBuffer()),
        draft,
        font ? new Uint8Array(await font.arrayBuffer()) : undefined,
      );
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Draft-${draft.code}-${draft.caseId}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to prepare the official form');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="my-4 rounded border p-3">
      <summary className="cursor-pointer font-semibold">Complete official PDF and check submission materials</summary>
      <p className="my-2">
        Select the original Form {draft.code}, Edition 2025 (Second Print 07/2026). Entries below apply only to this
        draft. Export is available while incomplete. Review both PDF pages before printing or submitting; signatures
        remain blank.
      </p>
      <div className="my-3 grid gap-2 md:grid-cols-2">
        {draft.fields.map((field) => (
          <label key={field.id}>
            {field.label} (draft)
            {field.id === 'decision' ? (
              <select
                className={inputClass}
                value={field.value}
                onChange={(event) => setOverrides({ ...overrides, [field.id]: event.target.value })}
              >
                <option value="">Review / leave unmarked</option>
                <option value="Upheld">Upheld</option>
                <option value="Denied">Denied</option>
              </select>
            ) : (
              <textarea
                className={inputClass}
                value={overrides[field.id] ?? field.value}
                rows={field.id === 'reason' || field.id === 'decisionReason' || field.id === 'subject' ? 4 : 1}
                maxLength={4000}
                onChange={(event) => setOverrides({ ...overrides, [field.id]: event.target.value })}
              />
            )}
            <span className="text-xs">
              {field.origin === 'record' ? 'From the case record' : 'Draft entry; review before use'}
            </span>
          </label>
        ))}
      </div>
      <label>
        Additional supporting attachments (one reference per line)
        <textarea
          className={inputClass}
          rows={3}
          maxLength={4000}
          value={attachmentsText}
          onChange={(event) => setAttachmentsText(event.target.value)}
        />
      </label>
      <label>
        Check completion through
        <select
          className={inputClass}
          value={phase}
          onChange={(event) => setPhase(event.target.value as ProtestFormPhase)}
        >
          <option value="SUBMISSION">Submission</option>
          <option value="RECEIPT">Receipt by an official</option>
          <option value="DECISION">Decision and notification</option>
        </select>
      </label>
      <p className="my-2">
        Confirm signatures and attachments against the actual submission packet. Changing draft values clears these
        confirmations. Attachment files are supplied separately.
      </p>
      {checks.map((check) => (
        <label key={check.id} className="my-1 block">
          <input
            type="checkbox"
            checked={checked.has(check.id)}
            onChange={(event) =>
              setConfirmations({ ...confirmations, [check.id]: event.target.checked ? fingerprint : '' })
            }
          />{' '}
          {check.label}
        </label>
      ))}
      {issues.length ? (
        <ul className="my-2 list-inside list-disc">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : (
        <p>All selected checks confirmed by the operator. This does not sign or submit the form.</p>
      )}
      <label className="my-2 block">
        Original official Form {draft.code} PDF
        <input
          className="block"
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => {
            setTemplate(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
      </label>
      <label className="my-2 block">
        Optional TTF/OTF font for names and non-Latin text
        <input
          className="block"
          type="file"
          accept=".ttf,.otf"
          onChange={(event) => setFont(event.target.files?.[0] ?? null)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="rounded border px-3 py-2 disabled:opacity-50"
        type="button"
        disabled={!template || busy}
        onClick={() => void exportPdf()}
      >
        {busy ? 'Preparing PDF...' : 'Export draft official PDF'}
      </button>
    </details>
  );
}
const inputClass = 'block w-full rounded border p-2 text-black bg-white';
