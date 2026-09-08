import type { ProtestCaseDto } from '@/shared/ipc/contracts';

const kindLabels: Record<ProtestCaseDto['kind'], string> = {
  VERBAL: 'Verbal protest',
  WRITTEN: 'Written protest',
  FINAL_VERBAL: 'Final verbal protest',
  APPEAL: 'Appeal',
};

/** An operational copy of the ledger, with an original layout independent of official forms. */
export function ProtestSheet({
  protest,
  loadedAt,
  originalFor,
}: {
  protest: ProtestCaseDto;
  loadedAt: string;
  originalFor?: string;
}) {
  return (
    <article className="mx-auto max-w-[190mm] bg-white p-6 font-sans text-[11px] text-black [overflow-wrap:anywhere]">
      <header className="border-b-2 border-black pb-3">
        <h1 className="text-xl font-bold">{kindLabels[protest.kind]} record</h1>
        <p>Operational copy · Saika Director · All times UTC</p>
        <p>Record retrieved: {loadedAt}</p>
        {originalFor && <p className="mt-2 font-bold">Original protest attached to appeal {originalFor}</p>}
      </header>
      <section className="mt-4">
        <p className="text-sm font-bold">Status: {protest.status}</p>
        <h2 className="mt-2 text-base font-semibold">{protest.subject}</h2>
        <p className="mt-2 whitespace-pre-wrap">{protest.statement}</p>
      </section>
      <dl className="mt-4 space-y-2 border-y border-black py-3">
        <Field label="Case ID" value={protest.id} />
        <Field label="Scope" value={`${protest.scopeType} · ${protest.scopeId}`} />
        {protest.parentProtestId && <Field label="Original protest ID" value={protest.parentProtestId} />}
        <Field label="Submitted by" value={protest.lodgedBy} />
        <Field label="Received at" value={protest.lodgedAt} />
        <Field label="Receiving official" value={protest.openedBy} />
        <Field label="Action / decision time" value={protest.triggeringDecisionAt} />
        <Field label="Document reference" value={protest.formReference} />
        <Field label="Fee received" value={protest.feePaidEuro === null ? null : `EUR ${protest.feePaidEuro}`} />
        <Field label="Late acceptance explanation" value={protest.lateAcceptanceReason} />
        <Field label="Created at" value={protest.createdAt} />
      </dl>
      <section className="mt-4">
        <h2 className="border-b border-black pb-1 text-sm font-bold">Decisions and handling history</h2>
        {protest.entries.length === 0 ? (
          <p className="mt-2">No actions recorded</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {protest.entries.map((entry) => (
              <li key={entry.id} className="border-b border-gray-400 pb-2">
                <h3 className="font-semibold">{entry.type.replaceAll('_', ' ')}</h3>
                <p className="whitespace-pre-wrap">{entry.statement}</p>
                <p className="mt-1">Official: {entry.officialName}</p>
                {entry.ruleReference && <p>Rule reference: {entry.ruleReference}</p>}
                <p>
                  Occurred: {entry.occurredAt} · Recorded: {entry.recordedAt}
                </p>
                <p className="text-[9px]">Entry ID: {entry.id}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      <footer className="mt-6 border-t border-black pt-2 text-[9px]">
        Recorded names identify the people entered in the ledger. Complete the applicable official form and signatures
        separately when required.
      </footer>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3">
      <dt className="font-semibold">{label}</dt>
      <dd className="whitespace-pre-wrap">{value ?? 'Not recorded'}</dd>
    </div>
  );
}
