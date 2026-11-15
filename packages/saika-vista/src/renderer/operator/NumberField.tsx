// SPDX-License-Identifier: MIT
export function NumberField({
  label,
  value,
  min = 1,
  max,
  step = 1,
  integerOnly = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  integerOnly?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        disabled={disabled}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && (!integerOnly || Number.isSafeInteger(next)))
            onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, next)));
        }}
      />
    </label>
  );
}
