import { Printer } from 'lucide-react';
import { useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { protestsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { ProtestCaseDto, RecordProtestEntryPayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { toDateTimeLocalValue } from '../shared/common/dateUtils';
import { inputClass } from '../shared/common/formClasses';

import { Field, protestFormClass } from './ProtestFields';

/** The selected record with its action form and history. The panel keys it by record. */
export function ProtestDetail({
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
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalValue(new Date(), 'seconds'));
  const [ruleReference, setRuleReference] = useState('');
  const { busy: saving, error, run } = useAsyncAction();
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
          className={protestFormClass}
          onSubmit={(event) => {
            event.preventDefault();
            if (saving) return;
            void run(async () => {
              unwrap(
                await protestsService.recordEntry({
                  caseId: protest.id,
                  type,
                  statement,
                  officialName: official,
                  occurredAt: new Date(occurredAt).toISOString(),
                  ruleReference: ruleReference.trim() || null,
                }),
              );
              setStatement('');
              setOccurredAt(toDateTimeLocalValue(new Date(), 'seconds'));
              await onChanged();
            }, 'Failed to record the action');
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
