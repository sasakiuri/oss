import { paddedInputClass } from '../shared/common/formClasses';

/** Label of the malfunction case and entry form fields. */
export const malfunctionLabelClass = 'flex flex-col gap-1 text-xs font-medium text-vscode-text-muted';

export function NumberField({
  label,
  value,
  onChange,
  minimum = 0,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimum?: number;
  disabled?: boolean;
}) {
  return (
    <label className={malfunctionLabelClass}>
      {label}
      <input
        type="number"
        min={minimum}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={paddedInputClass}
      />
    </label>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-vscode-text-muted">{label}</div>
      <div className="mt-0.5 text-xs text-vscode-text">{value}</div>
    </div>
  );
}
