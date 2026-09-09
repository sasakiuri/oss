import { useState } from 'react';

import type {
  AppendTargetExaminationEntryPayload,
  TargetExaminationCaseDto,
  TargetExaminationEntryTypeDto,
  TargetExaminationEvidenceTypeDto,
} from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { Field, inputClass } from './ExaminationFields';
import { defaultEntryRule, entryOptions, EVIDENCE_OPTIONS, toLocalInputValue } from './examinationPresentation';
import type { TargetExaminationCommands } from './examinationTypes';

export function EvidenceForm({
  examination,
  saving,
  onCancel,
  onSubmitCommand,
}: {
  examination: TargetExaminationCaseDto;
  saving: boolean;
  onCancel: () => void;
  onSubmitCommand: TargetExaminationCommands['addEvidence'];
}) {
  const [type, setType] = useState<TargetExaminationEvidenceTypeDto>('CONTROL_SHEET');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [contentHashSha256, setContentHashSha256] = useState('');
  const [collectedBy, setCollectedBy] = useState('');
  const [collectedAt, setCollectedAt] = useState(toLocalInputValue(new Date()));

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmitCommand({
          caseId: examination.id,
          type,
          description,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(contentHashSha256.trim() ? { contentHashSha256: contentHashSha256.trim() } : {}),
          collectedBy,
          collectedAt: new Date(collectedAt).toISOString(),
        }).then((succeeded) => {
          if (succeeded) onCancel();
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Add examination item</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Item type">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as TargetExaminationEvidenceTypeDto)}
            className={inputClass}
          >
            {EVIDENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Collected at">
          <input
            required
            type="datetime-local"
            value={collectedAt}
            onChange={(event) => setCollectedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Reference or storage location">
          <input value={reference} onChange={(event) => setReference(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Collected by">
          <input
            required
            value={collectedBy}
            onChange={(event) => setCollectedBy(event.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          required
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="SHA-256 (optional, 64 hexadecimal characters)">
        <input
          value={contentHashSha256}
          onChange={(event) => setContentHashSha256(event.target.value)}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Append evidence
        </Button>
      </div>
    </form>
  );
}

export function EntryForm({
  examination,
  saving,
  onCancel,
  onSubmitCommand,
}: {
  examination: TargetExaminationCaseDto;
  saving: boolean;
  onCancel: () => void;
  onSubmitCommand: TargetExaminationCommands['appendEntry'];
}) {
  const options = entryOptions(examination);
  const [type, setType] = useState<TargetExaminationEntryTypeDto>(options[0]!.value);
  const [statement, setStatement] = useState('');
  const [ruleReference, setRuleReference] = useState(defaultEntryRule(options[0]!.value, examination));
  const [officialName, setOfficialName] = useState('');

  return (
    <form
      className="space-y-3 rounded-[3px] border border-vscode-border bg-vscode-bg p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          caseId: examination.id,
          type,
          statement,
          officialName,
          ...(ruleReference.trim() ? { ruleReference: ruleReference.trim() } : {}),
        } as AppendTargetExaminationEntryPayload;
        void onSubmitCommand(payload).then((succeeded) => {
          if (succeeded) onCancel();
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record examination action</h4>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Action">
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value as TargetExaminationEntryTypeDto;
              setType(next);
              setRuleReference(defaultEntryRule(next, examination));
            }}
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
      <Field label="Statement / authorization">
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label={type === 'DECISION' ? 'Rule reference (required)' : 'Rule reference'}>
        <input
          required={type === 'DECISION'}
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      {type === 'HOLD_RELEASED' && (
        <p className="text-xs text-vscode-warning">
          This authorizes Lane removal, session reset, and competition-data cleanup for the case scope.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          Append action
        </Button>
      </div>
    </form>
  );
}
