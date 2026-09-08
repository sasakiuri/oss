import type { ProtestCaseDto } from '../ipc/contracts/protests.contract';

export interface ProtestTransferContext {
  timeZone: string;
  parent?: ProtestCaseDto | null;
  eventName?: string;
  juryName?: string;
  nation?: string;
  receivingOfficial?: string;
}

interface TransferValue {
  value: string | null;
  origin: 'record' | 'entered' | 'manual';
}

/** Facts and field selection are separate so other forms can reuse the same read-only projection. */
export interface ProtestTransferProfile {
  code: string;
  kind: 'WRITTEN' | 'APPEAL';
  fields: readonly { fact: keyof ReturnType<typeof transferFacts>; label: string }[];
}

const receiptFields = [
  { fact: 'submittedBy', label: 'Submitting person' },
  { fact: 'signature', label: 'Submitter signature' },
  { fact: 'receiptDate', label: 'Receipt date' },
  { fact: 'receiptTime', label: 'Receipt time' },
  { fact: 'fee', label: 'Fee actually received (EUR)' },
  { fact: 'receiver', label: 'Receiving official name' },
  { fact: 'signature', label: 'Receiving official signature' },
] as const;
const decisionFields = [
  { fact: 'meetingDate', label: 'Jury meeting date' },
  { fact: 'meetingTime', label: 'Jury meeting time' },
  { fact: 'decision', label: 'Outcome for the form' },
  { fact: 'decisionReason', label: 'Decision explanation and cited rules' },
  { fact: 'chair', label: 'Jury chairperson name' },
  { fact: 'signature', label: 'Jury chairperson signature' },
  { fact: 'notificationDate', label: 'Notification date' },
  { fact: 'notificationTime', label: 'Notification time' },
  { fact: 'feeDisposition', label: 'Fee disposition' },
] as const;

export const protestTransferProfiles: Readonly<Record<'WRITTEN' | 'APPEAL', ProtestTransferProfile>> = {
  WRITTEN: {
    code: 'P',
    kind: 'WRITTEN',
    fields: [
      { fact: 'event', label: 'Event name' },
      { fact: 'jury', label: 'Jury addressed' },
      { fact: 'actionDate', label: 'Contested action date' },
      { fact: 'actionTime', label: 'Contested action time' },
      { fact: 'subject', label: 'Contested action description' },
      { fact: 'reason', label: 'Protest explanation and cited rules' },
      ...receiptFields,
      ...decisionFields,
    ],
  },
  APPEAL: {
    code: 'AP',
    kind: 'APPEAL',
    fields: [
      { fact: 'reason', label: 'Appeal explanation' },
      { fact: 'nation', label: 'Submitting nation' },
      ...receiptFields,
      ...decisionFields,
      { fact: 'signature', label: 'Additional signature' },
    ],
  },
};

export function createProtestFormTransfer(
  protest: ProtestCaseDto,
  context: ProtestTransferContext,
  profile?: ProtestTransferProfile,
) {
  if (protest.kind !== 'WRITTEN' && protest.kind !== 'APPEAL')
    throw new Error('Form transfer is available for written protests and appeals');
  if (protest.status === 'VOID') throw new Error('Void records cannot be transferred to a submission form');
  if (
    protest.kind === 'APPEAL' &&
    (!context.parent ||
      context.parent.id !== protest.parentProtestId ||
      context.parent.kind !== 'WRITTEN' ||
      context.parent.scopeType !== protest.scopeType ||
      context.parent.scopeId !== protest.scopeId)
  )
    throw new Error('Load the matching original written protest before transferring an appeal');
  const selected = profile ?? protestTransferProfiles[protest.kind];
  if (selected.kind !== protest.kind) throw new Error('The selected form does not match the record kind');
  const facts = transferFacts(protest, context);
  return {
    code: selected.code,
    caseId: protest.id,
    status: protest.status,
    timeZone: context.timeZone,
    attachment:
      protest.kind === 'APPEAL'
        ? {
            caseId: context.parent!.id,
            formReference: context.parent!.formReference,
          }
        : null,
    fields: selected.fields.map(({ fact, label }) => ({ label, ...facts[fact] })),
  };
}

function transferFacts(protest: ProtestCaseDto, context: ProtestTransferContext) {
  // Constructing the formatter validates the explicitly selected zone, even if an optional date is absent.
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: context.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const dateTime = (instant: string | null) => {
    if (!instant) return { date: null, time: null };
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
    );
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
  };
  const recorded = (value: string | null): TransferValue => ({
    value: value?.trim() || null,
    origin: value?.trim() ? 'record' : 'manual',
  });
  const entered = (value?: string): TransferValue => ({
    value: value?.trim() || null,
    origin: value?.trim() ? 'entered' : 'manual',
  });
  const missing = recorded(null);
  const receipt = dateTime(protest.lodgedAt);
  const action = dateTime(protest.triggeringDecisionAt);
  const decisions = protest.entries.filter((entry) => entry.type.startsWith('DECIDED_'));
  const decision = decisions.length === 1 ? decisions[0] : null;
  const feeEntries = protest.entries.filter((entry) => entry.type === 'FEE_REFUNDED' || entry.type === 'FEE_RETAINED');
  const feeKinds = new Set(feeEntries.map((entry) => entry.type));
  return {
    event: entered(context.eventName),
    jury: entered(context.juryName),
    nation: entered(context.nation),
    subject: recorded(protest.subject),
    reason: recorded(protest.statement),
    submittedBy: recorded(protest.lodgedBy),
    receiver: entered(context.receivingOfficial),
    signature: missing,
    receiptDate: recorded(receipt.date),
    receiptTime: recorded(receipt.time),
    actionDate: recorded(action.date),
    actionTime: recorded(action.time),
    fee: recorded(protest.feePaidEuro === null ? null : String(protest.feePaidEuro)),
    meetingDate: missing,
    meetingTime: missing,
    chair: missing,
    decision: recorded(
      decision?.type === 'DECIDED_UPHELD' ? 'Upheld' : decision?.type === 'DECIDED_REJECTED' ? 'Denied' : null,
    ),
    decisionReason: recorded(decision ? [decision.statement, decision.ruleReference].filter(Boolean).join('\n') : null),
    notificationDate: missing,
    notificationTime: missing,
    feeDisposition: recorded(feeKinds.size !== 1 ? null : feeKinds.has('FEE_REFUNDED') ? 'Returned' : 'Retained'),
  };
}
