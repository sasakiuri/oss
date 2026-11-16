import { useState } from 'react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { protestsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { ProtestCaseDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { toDateTimeLocalValue } from '../shared/common/dateUtils';
import { inputClass } from '../shared/common/formClasses';

import { Field, protestFormClass } from './ProtestFields';

/** Lodges a protest or appeal. The panel mounts it only while lodging, keyed by event. */
export function CreateProtestForm({
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
  const [lodgedAt, setLodgedAt] = useState(toDateTimeLocalValue(new Date(), 'seconds'));
  const [feePaid, setFeePaid] = useState('');
  const [lateAcceptanceReason, setLateAcceptanceReason] = useState('');
  const { busy: saving, error, run } = useAsyncAction();
  const formal = kind === 'WRITTEN' || kind === 'APPEAL';
  return (
    <form
      className={protestFormClass}
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        void run(async () => {
          const created = unwrap(
            await protestsService.create({
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
            }),
          );
          await onSaved(created);
        }, 'Failed to record the protest');
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
