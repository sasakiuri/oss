import { protestTransferProfiles, type createProtestFormTransfer } from './ProtestFormTransfer';

export type ProtestFormPhase = 'SUBMISSION' | 'RECEIPT' | 'DECISION';
export type ProtestFormTransfer = ReturnType<typeof createProtestFormTransfer>;
export interface ProtestFormDraft {
  code: 'P' | 'AP';
  caseId: string;
  fields: {
    id: string;
    label: string;
    value: string;
    phase: ProtestFormPhase;
    origin: 'record' | 'entered' | 'manual';
  }[];
  signatures: { id: string; label: string; phase: ProtestFormPhase }[];
  attachment: ProtestFormTransfer['attachment'];
}
const receipt = new Set(['receiptDate', 'receiptTime', 'fee', 'receiver']);
const decision = new Set([
  'meetingDate',
  'meetingTime',
  'decision',
  'decisionReason',
  'chair',
  'notificationDate',
  'notificationTime',
  'feeDisposition',
]);

/** A temporary completion model; it neither records decisions nor signs or submits a case. */
export function createProtestFormDraft(
  transfer: ProtestFormTransfer,
  overrides: Readonly<Record<string, string>> = {},
): ProtestFormDraft {
  const profile =
    transfer.code === 'P'
      ? protestTransferProfiles.WRITTEN
      : transfer.code === 'AP'
        ? protestTransferProfiles.APPEAL
        : null;
  if (!profile) throw new Error('No official form completion profile for this transfer');
  const fields: ProtestFormDraft['fields'] = [];
  const signatures: ProtestFormDraft['signatures'] = [];
  profile.fields.forEach((spec, index) => {
    const value = transfer.fields[index];
    if (!value || value.label !== spec.label) throw new Error('The form fields do not match the completion profile');
    if (spec.fact === 'signature') {
      signatures.push({
        id: `signature-${index}`,
        label: spec.label,
        phase: spec.label.startsWith('Submitter')
          ? 'SUBMISSION'
          : spec.label.startsWith('Receiving')
            ? 'RECEIPT'
            : 'DECISION',
      });
      return;
    }
    fields.push({
      id: spec.fact,
      label: spec.label,
      value: (overrides[spec.fact] ?? value.value ?? '').trim(),
      origin: overrides[spec.fact] === undefined ? value.origin : 'entered',
      phase: receipt.has(spec.fact) ? 'RECEIPT' : decision.has(spec.fact) ? 'DECISION' : 'SUBMISSION',
    });
  });
  return {
    code: profile.code as 'P' | 'AP',
    caseId: transfer.caseId,
    fields,
    signatures,
    attachment: transfer.attachment,
  };
}

export function assessProtestFormDraft(
  draft: ProtestFormDraft,
  phase: ProtestFormPhase,
  checked: ReadonlySet<string>,
  attachments: readonly string[] = [],
) {
  const order: ProtestFormPhase[] = ['SUBMISSION', 'RECEIPT', 'DECISION'];
  const includes = (value: ProtestFormPhase) => order.indexOf(value) <= order.indexOf(phase);
  return [
    ...draft.fields.filter((field) => includes(field.phase) && !field.value).map((field) => `Complete ${field.label}`),
    ...draft.signatures
      .filter((signature) => includes(signature.phase) && !checked.has(signature.id))
      .map((signature) => `Confirm ${signature.label} on the signed form`),
    ...(draft.attachment && !checked.has('original-protest')
      ? [
          `Confirm the original Protest Form P attachment (${draft.attachment.formReference ?? draft.attachment.caseId})`,
        ]
      : []),
    ...attachments
      .filter((reference) => !checked.has(`attachment:${reference}`))
      .map((reference) => `Confirm attachment: ${reference}`),
  ];
}
