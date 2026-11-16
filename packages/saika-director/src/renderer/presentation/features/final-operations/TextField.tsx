// SPDX-License-Identifier: MIT
import { blockInputClass, mutedLabelClass } from '../shared/common/formClasses';

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'datetime-local';
}

/** A muted label above a full-width input. */
export function TextField({ label, value, onChange, type }: TextFieldProps) {
  return (
    <label className={mutedLabelClass}>
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={blockInputClass} />
    </label>
  );
}
