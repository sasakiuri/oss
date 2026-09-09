// SPDX-License-Identifier: MIT
import { Link } from 'lucide-react';
import { useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import type {
  AppendRangeInterruptionEntryPayload,
  RangeInterruptionCaseDto,
  RangeInterruptionEntryTypeDto,
  RangeInterruptionScopePayload,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { FormButtons, Field, inputClass, formClass } from './InterruptionFields';
import { toLocalInputValue } from './interruptionFormatting';
import { type FormProps } from './interruptionPresentationTypes';

export function EndInterruptionForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue(new Date()));
  const [statement, setStatement] = useState('The interruption ended and the athlete is ready for the Jury decision.');
  const [officialName, setOfficialName] = useState(interruption.openedBy);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.appendEntry({
            caseId: interruption.id,
            type: 'ENDED',
            occurredAt: new Date(occurredAt).toISOString(),
            statement,
            officialName,
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">End interruption and calculate lost time</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ended at">
          <input
            required
            type="datetime-local"
            step={1}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="End interruption" onCancel={onCancel} />
    </form>
  );
}

export function LaneOperationForm({
  title,
  description,
  submitLabel,
  defaultOfficial,
  saving,
  onCancel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  defaultOfficial: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (officialName: string) => Promise<void>;
}) {
  const [officialName, setOfficialName] = useState(defaultOfficial);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(officialName);
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">{title}</h4>
      <p className="text-xs leading-5 text-vscode-text-muted">{description}</p>
      <Field label="Official name">
        <input
          required
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}

export function GenericEntryForm({
  interruption,
  allowFinalization,
  saving,
  onCancel,
  onMutate,
}: FormProps & { allowFinalization: boolean }) {
  const options = entryOptions(interruption.status, allowFinalization);
  const [type, setType] = useState<RangeInterruptionEntryTypeDto>(options[0]!.value);
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [ruleReference, setRuleReference] = useState('');
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const payload = {
            caseId: interruption.id,
            type,
            occurredAt: new Date().toISOString(),
            statement,
            officialName,
            ...(ruleReference.trim() ? { ruleReference: ruleReference.trim() } : {}),
          } as AppendRangeInterruptionEntryPayload;
          const response = await rangeInterruptionsService.appendEntry(payload);
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record audit action</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Action">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as RangeInterruptionEntryTypeDto)}
            className={inputClass}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Official name">
          <input
            required
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Rule reference">
        <input
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <FormButtons saving={saving} submitLabel="Append action" onCancel={onCancel} />
    </form>
  );
}

export function LinkScopeForm({
  interruption,
  scope,
  saving,
  onMutate,
}: {
  interruption: RangeInterruptionCaseDto;
  scope: RangeInterruptionScopePayload;
  saving: boolean;
  onMutate: FormProps['onMutate'];
}) {
  const [linkedBy, setLinkedBy] = useState('');
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.linkScope({
            caseId: interruption.id,
            scope,
            linkedBy,
            note: `Linked from the current ${scope.scopeType.toLowerCase()} workspace`,
          });
          if (!response.success) throw new Error(response.error.message);
          return response.data;
        });
      }}
    >
      <div className="min-w-52 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-vscode-text">
          <Link size={13} aria-hidden="true" /> Link current {scope.scopeType.toLowerCase()}
        </p>
        <input
          required
          aria-label="Linked by"
          placeholder="Official name"
          value={linkedBy}
          onChange={(event) => setLinkedBy(event.target.value)}
          className={`${inputClass} mt-2`}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={saving}>
        Link scope
      </Button>
    </form>
  );
}

function entryOptions(
  status: RangeInterruptionCaseDto['status'],
  allowFinalization: boolean,
): Array<{ value: RangeInterruptionEntryTypeDto; label: string }> {
  if (status === 'CLOSED')
    return [
      { value: 'REOPENED', label: 'Reopen record and reinstate hold' },
      { value: 'VOID', label: 'Void record' },
    ];
  const options: Array<{ value: RangeInterruptionEntryTypeDto; label: string }> = [{ value: 'NOTE', label: 'Note' }];
  if (allowFinalization) {
    if (status !== 'OPEN') options.push({ value: 'CLOSED', label: 'Close record and release hold' });
    options.push({ value: 'VOID', label: 'Void record' });
  }
  return options;
}
