import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { protestsService } from '@/renderer/services';
import type { ProtestCaseDto, RecordProtestEntryPayload } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

export function ProtestsPanel({ scopeId }: { scopeId: string }) {
  const [cases, setCases] = useState<ProtestCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scope = { scopeType: 'EVENT' as const, scopeId };
  const load = useCallback(async () => {
    setError(null);
    const response = await protestsService.list(scope);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setCases(response.data);
    setSelectedId((current) =>
      current && response.data.some((item) => item.id === current) ? current : (response.data.at(-1)?.id ?? null),
    );
  }, [scopeId]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = cases.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Protests and Appeals</h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Append-only Form P, fee, deadline and Jury-decision record (ISSF 6.16 / 6.17.1.13).
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw size={13} /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={13} /> Lodge
          </Button>
        </div>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {creating && (
        <CreateProtestForm
          scopeId={scopeId}
          cases={cases}
          onCancel={() => setCreating(false)}
          onSaved={async (item) => {
            setCreating(false);
            setSelectedId(item.id);
            await load();
          }}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="border border-vscode-border">
          {cases.length === 0 && <p className="p-3 text-xs text-vscode-text-muted">No protest records.</p>}
          {[...cases].reverse().map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`block w-full border-b border-vscode-border p-3 text-left text-xs ${item.id === selectedId ? 'bg-vscode-highlight' : ''}`}
            >
              <span className="block font-semibold text-vscode-text">{item.subject}</span>
              <span className="text-vscode-text-muted">
                {item.kind} · {item.status}
              </span>
            </button>
          ))}
        </aside>
        {selected && <ProtestDetail protest={selected} onChanged={load} />}
      </div>
    </div>
  );
}

function CreateProtestForm({
  scopeId,
  cases,
  onCancel,
  onSaved,
}: {
  scopeId: string;
  cases: ProtestCaseDto[];
  onCancel: () => void;
  onSaved: (item: ProtestCaseDto) => Promise<void>;
}) {
  const [kind, setKind] = useState<'VERBAL' | 'WRITTEN' | 'FINAL_VERBAL' | 'APPEAL'>('VERBAL');
  const [subject, setSubject] = useState('');
  const [statement, setStatement] = useState('');
  const [lodgedBy, setLodgedBy] = useState('');
  const [official, setOfficial] = useState('');
  const [triggeredAt, setTriggeredAt] = useState(localDate(new Date()));
  const [formReference, setFormReference] = useState('');
  const [parentId, setParentId] = useState('');
  const formal = kind === 'WRITTEN' || kind === 'APPEAL';
  const expectedFee = kind === 'WRITTEN' ? 50 : kind === 'APPEAL' ? 100 : 0;
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const response = await protestsService.create({
            scopeType: 'EVENT',
            scopeId,
            kind,
            ...(kind === 'APPEAL' ? { parentProtestId: parentId } : {}),
            subject,
            statement,
            lodgedBy,
            lodgedAt: new Date().toISOString(),
            ...(formal
              ? { triggeringDecisionAt: new Date(triggeredAt).toISOString(), formReference, feePaidEuro: expectedFee }
              : { feePaidEuro: 0 }),
            openedBy: official,
          });
          if (!response.success) return;
          await onSaved(response.data);
        })();
      }}
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">Lodge protest or appeal</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputClass}>
            <option value="VERBAL">Verbal protest</option>
            <option value="WRITTEN">Written Form P</option>
            <option value="FINAL_VERBAL">Final — immediate verbal</option>
            <option value="APPEAL">Appeal</option>
          </select>
        </Field>
        {kind === 'APPEAL' && (
          <Field label="Parent protest">
            <select required value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {cases
                .filter((item) => item.kind !== 'FINAL_VERBAL')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.subject}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {formal && (
          <Field label="Decision / action time">
            <input
              required
              type="datetime-local"
              value={triggeredAt}
              onChange={(e) => setTriggeredAt(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        {formal && (
          <Field label={`Form P reference · fee EUR ${expectedFee}`}>
            <input
              required
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Lodged by">
          <input required value={lodgedBy} onChange={(e) => setLodgedBy(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Receiving official">
          <input required value={official} onChange={(e) => setOfficial(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Subject">
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Statement">
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Record
        </Button>
      </div>
    </form>
  );
}

function ProtestDetail({ protest, onChanged }: { protest: ProtestCaseDto; onChanged: () => Promise<void> }) {
  const [type, setType] = useState<RecordProtestEntryPayload['type']>('NOTE');
  const [statement, setStatement] = useState('');
  const [official, setOfficial] = useState('');
  return (
    <section className="space-y-3">
      <div className="border border-vscode-border p-3 text-xs">
        <h3 className="text-sm font-semibold text-vscode-text">{protest.subject}</h3>
        <p className="mt-2 whitespace-pre-wrap text-vscode-text-muted">{protest.statement}</p>
        <p className="mt-2 text-vscode-dimmed">
          {protest.kind} · lodged by {protest.lodgedBy} · {new Date(protest.lodgedAt).toLocaleString()}
        </p>
        <p className={protest.compliance.issues.length ? 'mt-2 text-vscode-warning' : 'mt-2 text-vscode-success'}>
          {protest.compliance.issues.length
            ? protest.compliance.issues.join(' · ')
            : `Compliance fields complete · ${protest.compliance.ruleReferences}`}
        </p>
      </div>
      {protest.status !== 'CLOSED' && protest.status !== 'VOID' && (
        <form
          className={formClass}
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const response = await protestsService.recordEntry({
                caseId: protest.id,
                type,
                statement,
                officialName: official,
                occurredAt: new Date().toISOString(),
              });
              if (response.success) {
                setStatement('');
                await onChanged();
              }
            })();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Action">
              <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={inputClass}>
                {[
                  'FORWARDED_TO_JURY',
                  'DECIDED_UPHELD',
                  'DECIDED_PARTLY_UPHELD',
                  'DECIDED_REJECTED',
                  'FEE_REFUNDED',
                  'FEE_RETAINED',
                  'NOTE',
                  'CLOSED',
                  'VOID',
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Official">
              <input required value={official} onChange={(e) => setOfficial(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Decision / note">
            <textarea
              required
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Button type="submit" size="sm">
            Append action
          </Button>
        </form>
      )}
      <ol className="space-y-2">
        {protest.entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-vscode-border pl-3 text-xs">
            <b>{entry.type}</b> · {entry.statement}
            <span className="block text-vscode-dimmed">
              {entry.officialName} · {new Date(entry.occurredAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-vscode-text-muted">
      {label}
      {children}
    </label>
  );
}
function localDate(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
const formClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
