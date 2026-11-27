// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { rangeInterruptionsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';

import { spacedPanelClass } from '../shared/common/formClasses';

import { FormButtons, Field, inputClass } from './InterruptionFields';
import { type FormProps } from './interruptionPresentationTypes';
import { toDateTimeLocalValue } from '../shared/common/dateUtils';

export function TargetRecoveryForm({ interruption, saving, onCancel, onMutate }: FormProps) {
  const [repairCompleted, setRepairCompleted] = useState(false);
  const [repairCompletedAt, setRepairCompletedAt] = useState(toDateTimeLocalValue(new Date(), 'seconds'));
  const [movedToReserve, setMovedToReserve] = useState(false);
  const [reserveFiringPointNumber, setReserveFiringPointNumber] = useState('');
  const [statement, setStatement] = useState('');
  const [officialName, setOfficialName] = useState(interruption.openedBy);
  return (
    <form
      className={spacedPanelClass}
      onSubmit={(event) => {
        event.preventDefault();
        void onMutate(async () => {
          const response = await rangeInterruptionsService.recordTargetRecovery({
            caseId: interruption.id,
            ...(repairCompleted ? { repairCompletedAt: new Date(repairCompletedAt).toISOString() } : {}),
            movedToReserveFiringPoint: movedToReserve,
            ...(movedToReserve ? { reserveFiringPointNumber: Number(reserveFiringPointNumber) } : {}),
            statement,
            officialName,
            assessedAt: new Date().toISOString(),
          });
          const recorded = unwrap(response);
          onCancel();
          return recorded;
        });
      }}
    >
      <h4 className="text-[13px] font-semibold text-vscode-text">Record single-target recovery facts</h4>
      <p className="text-xs leading-5 text-vscode-text-muted">
        ISSF 6.10.9.2 applies only when repair exceeds five minutes and the athlete moves to a reserve firing point.
        This record does not grant time.
      </p>
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input
          type="checkbox"
          checked={repairCompleted}
          onChange={(event) => setRepairCompleted(event.target.checked)}
        />
        The target was repaired
      </label>
      {repairCompleted && (
        <Field label="Repair completed at">
          <input
            required
            type="datetime-local"
            step={1}
            value={repairCompletedAt}
            onChange={(event) => setRepairCompletedAt(event.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      <label className="flex items-start gap-2 text-xs text-vscode-text">
        <input type="checkbox" checked={movedToReserve} onChange={(event) => setMovedToReserve(event.target.checked)} />
        Athlete moved to a reserve firing point
      </label>
      {movedToReserve && (
        <Field label="Reserve firing point number">
          <input
            required
            type="number"
            min={1}
            step={1}
            value={reserveFiringPointNumber}
            onChange={(event) => setReserveFiringPointNumber(event.target.value)}
            className={inputClass}
          />
        </Field>
      )}
      <Field label="Observed recovery facts">
        <textarea
          required
          rows={2}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
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
      <FormButtons saving={saving} submitLabel="Record recovery facts" onCancel={onCancel} />
    </form>
  );
}
