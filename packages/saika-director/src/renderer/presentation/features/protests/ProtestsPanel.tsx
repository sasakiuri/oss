import { Plus, Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { boardService, protestsService } from '@/renderer/services';
import type { ProtestCaseDto, RecordProtestEntryPayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

export function ProtestsPanel({ scopeId }: { scopeId: string }) {
  const [cases, setCases] = useState<ProtestCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadId = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++loadId.current;
    setError(null);
    try {
      const response = await protestsService.list({ scopeType: 'EVENT', scopeId });
      if (requestId !== loadId.current) return;
      if (!response.success) throw new Error(response.error.message);
      setCases(response.data);
      setSelectedId((current) =>
        current && response.data.some((item) => item.id === current) ? current : (response.data.at(-1)?.id ?? null),
      );
    } catch (caught) {
      if (requestId === loadId.current)
        setError(caught instanceof Error ? caught.message : 'Failed to load protest records');
    }
  }, [scopeId]);
  useEffect(() => {
    setCases([]);
    setSelectedId(null);
    setCreating(false);
    void load();
    return () => {
      loadId.current++;
    };
  }, [load]);
  const selected = cases.find((item) => item.id === selectedId) ?? null;
  const print = async (protestId: string) => {
    setError(null);
    try {
      const response = await boardService.openProtestPrint({ protestId });
      if (!response.success) throw new Error(response.error.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to open the protest print preview');
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Protests and Appeals</h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Form P / Form AP references, fees, deadlines and Jury decisions (ISSF 6.16 / 6.17.1.13).
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
      {error && (
        <p role="alert" className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">
          {error}
        </p>
      )}
      {creating && (
        <CreateProtestForm
          key={scopeId}
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
        {selected && <ProtestDetail key={selected.id} protest={selected} onChanged={load} onPrint={print} />}
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
  const [triggeredAt, setTriggeredAt] = useState('');
  const [formReference, setFormReference] = useState('');
  const [parentId, setParentId] = useState('');
  const [lodgedAt, setLodgedAt] = useState(localDate(new Date()));
  const [feePaid, setFeePaid] = useState('');
  const [lateAcceptanceReason, setLateAcceptanceReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formal = kind === 'WRITTEN' || kind === 'APPEAL';
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError(null);
        void (async () => {
          try {
            const response = await protestsService.create({
              scopeType: 'EVENT',
              scopeId,
              kind,
              ...(kind === 'APPEAL' ? { parentProtestId: parentId } : {}),
              subject,
              statement,
              lodgedBy,
              lodgedAt: new Date(lodgedAt).toISOString(),
              ...(formal
                ? {
                    triggeringDecisionAt: triggeredAt ? new Date(triggeredAt).toISOString() : null,
                    formReference: formReference.trim() || null,
                    lateAcceptanceReason: lateAcceptanceReason.trim() || null,
                  }
                : {}),
              feePaidEuro: feePaid === '' ? null : Number(feePaid),
              openedBy: official,
            });
            if (!response.success) throw new Error(response.error.message);
            await onSaved(response.data);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Failed to record the protest');
          } finally {
            setSaving(false);
          }
        })();
      }}
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">Lodge protest or appeal</h3>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      <fieldset disabled={saving} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputClass}>
              <option value="VERBAL">Verbal protest</option>
              <option value="WRITTEN">Written Form P</option>
              <option value="FINAL_VERBAL">Final — immediate verbal</option>
              <option value="APPEAL">Appeal Form AP</option>
            </select>
          </Field>
          {kind === 'APPEAL' && (
            <Field label="Parent protest">
              <select required value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {cases
                  .filter((item) => item.compliance.appealPermitted && item.status !== 'VOID')
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
                type="datetime-local"
                step="1"
                value={triggeredAt}
                onChange={(e) => setTriggeredAt(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          {formal && (
            <Field label={kind === 'APPEAL' ? 'Form AP reference' : 'Form P reference'}>
              <input value={formReference} onChange={(e) => setFormReference(e.target.value)} className={inputClass} />
            </Field>
          )}
          <Field label="Received at (local time)">
            <input
              required
              type="datetime-local"
              step="1"
              value={lodgedAt}
              onChange={(e) => setLodgedAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Fee received (EUR; blank if not recorded)">
            <input
              type="number"
              min="0"
              step="1"
              value={feePaid}
              onChange={(e) => setFeePaid(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Lodged by">
            <input required value={lodgedBy} onChange={(e) => setLodgedBy(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Receiving official">
            <input required value={official} onChange={(e) => setOfficial(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {formal && (
          <Field label="Late acceptance explanation (if applicable)">
            <textarea
              value={lateAcceptanceReason}
              onChange={(e) => setLateAcceptanceReason(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}
        <Field label="Subject">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
        </Field>
        <p className="text-xs text-vscode-text-muted">
          Record the actual receipt details. Missing fee or document information remains visible for review.
        </p>
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
      </fieldset>
    </form>
  );
}

function ProtestDetail({
  protest,
  onChanged,
  onPrint,
}: {
  protest: ProtestCaseDto;
  onChanged: () => Promise<void>;
  onPrint: (protestId: string) => Promise<void>;
}) {
  const [type, setType] = useState<RecordProtestEntryPayload['type']>('NOTE');
  const [statement, setStatement] = useState('');
  const [official, setOfficial] = useState('');
  const [occurredAt, setOccurredAt] = useState(localDate(new Date()));
  const [ruleReference, setRuleReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="space-y-3">
      <div className="border border-vscode-border p-3 text-xs">
        <h3 className="text-sm font-semibold text-vscode-text">{protest.subject}</h3>
        <Button size="sm" variant="secondary" onClick={() => void onPrint(protest.id)}>
          <Printer size={13} /> Print operational copy
        </Button>
        <p className="mt-2 whitespace-pre-wrap text-vscode-text-muted">{protest.statement}</p>
        <p className="mt-2 text-vscode-dimmed">
          {protest.kind} · lodged by {protest.lodgedBy} · {new Date(protest.lodgedAt).toLocaleString()}
        </p>
        <p className={protest.compliance.issues.length ? 'mt-2 text-vscode-warning' : 'mt-2 text-vscode-success'}>
          {protest.compliance.issues.length
            ? protest.compliance.issues.join(' · ')
            : `Receipt fields complete · ${protest.compliance.ruleReferences}`}
        </p>
      </div>
      {protest.status !== 'CLOSED' && protest.status !== 'VOID' && (
        <form
          className={formClass}
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            setError(null);
            void (async () => {
              try {
                const response = await protestsService.recordEntry({
                  caseId: protest.id,
                  type,
                  statement,
                  officialName: official,
                  occurredAt: new Date(occurredAt).toISOString(),
                  ruleReference: ruleReference.trim() || null,
                });
                if (!response.success) throw new Error(response.error.message);
                setStatement('');
                setOccurredAt(localDate(new Date()));
                await onChanged();
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Failed to record the action');
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          {error && (
            <p role="alert" className="text-xs text-vscode-error">
              {error}
            </p>
          )}
          <fieldset disabled={saving} className="space-y-3">
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
              <Field label="Action time (local time)">
                <input
                  required
                  type="datetime-local"
                  step="1"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Rule reference">
                <input
                  value={ruleReference}
                  onChange={(e) => setRuleReference(e.target.value)}
                  className={inputClass}
                />
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
          </fieldset>
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
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
const formClass = 'space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3';
