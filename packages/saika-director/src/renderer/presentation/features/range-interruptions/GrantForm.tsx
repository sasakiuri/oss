// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';

import { FormButtons, Field, inputClass, formClass } from './InterruptionFields';
import { type FormProps } from './interruptionPresentationTypes';

export function GrantForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const recommendation = interruption.recommendation?.type === 'MATCH_TIME' ? interruption.recommendation : undefined;
  const [extensionSeconds, setExtensionSeconds] = useState(String(recommendation?.suggestedAdditionalSeconds ?? 0));
  const [authorizedRemainingSeconds, setAuthorizedRemainingSeconds] = useState(
    String(recommendation?.suggestedAuthorizedRemainingSeconds ?? interruption.remainingSecondsAtStart),
  );
  const [unlimitedSightingShots, setUnlimitedSightingShots] = useState(recommendation?.unlimitedSightingShots ?? false);
  const [incidentReportReference, setIncidentReportReference] = useState('');
  const [ruleReference, setRuleReference] = useState(recommendation?.ruleReferences ?? 'ISSF 6.11.3');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className={formClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.appendEntry({
            caseId: interruption.id,
            type: 'TIME_GRANTED',
            occurredAt: new Date().toISOString(),
            statement,
            officialName,
            extensionSeconds: Number(extensionSeconds),
            authorizedRemainingSeconds: Number(authorizedRemainingSeconds),
            unlimitedSightingShots,
            incidentReportReference,
            ruleReference,
          });
          if (!response.success) throw new Error(response.error.message);
          onCancel();
          return response.data;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record official time grant</h4>
      <p className="text-xs leading-5 text-vscode-warning">
        Values are prefilled from the recommendation, but this submit records an independent Jury / Range Officer
        decision.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Addition beyond preserved timer (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={extensionSeconds}
            onChange={(event) => setExtensionSeconds(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Authorized resume time (seconds)">
          <input
            required
            type="number"
            min={0}
            step={1}
            value={authorizedRemainingSeconds}
            onChange={(event) => setAuthorizedRemainingSeconds(event.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Range Incident Report reference">
          <input
            required
            value={incidentReportReference}
            onChange={(event) => setIncidentReportReference(event.target.value)}
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
      <Field label="Rule reference">
        <input
          required
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Decision statement">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          checked={unlimitedSightingShots}
          onChange={(event) => setUnlimitedSightingShots(event.target.checked)}
        />
        Authorize unlimited sighting shots before MATCH shots resume
      </label>
      <label className="flex items-start gap-2 text-xs text-vscode-warning">
        <input required type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I
        confirm this is an official grant, not an automatic policy result.
      </label>
      <FormButtons
        saving={saving}
        submitDisabled={!confirmed}
        submitLabel="Record official grant"
        onCancel={onCancel}
      />
    </form>
  );
}
