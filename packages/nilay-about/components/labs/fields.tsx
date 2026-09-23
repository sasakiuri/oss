'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface FieldOption<T extends string = string> {
  value: T;
  label: string;
}

interface NumberFieldProps<U extends string> {
  label: string;
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
  errorText?: string;
  hint?: ReactNode;
  min?: number;
  max?: number;
  /** What the arrow keys add. Any value can still be typed. */
  step?: number;
  /** A fixed id, for a field that something else has to move focus to. */
  fieldId?: string;
  /** A fixed unit, written after the number. */
  unit?: string;
  /**
   * A choice of units, offered inside the same field. Picking one is up to the caller: a measured
   * quantity is converted, a count of steps on a table is read anew.
   */
  units?: {
    value: U;
    options: readonly FieldOption<U>[];
    onChange: (unit: U) => void;
    /** Read out for the unit picker, which has no visible label of its own. */
    label: string;
  };
  className?: string;
}

/**
 * A number with its unit, as one control.
 *
 * The tools used to give every unit a full-width select of its own beside the number, labelled
 * "velocity unit", "weight unit" and so on. A unit is set once and then left alone, so that doubled
 * the form for a choice nobody revisits, and split each quantity across two fields.
 */
export function NumberField<U extends string = string>({
  label,
  value,
  onChange,
  invalid = false,
  errorText,
  hint,
  min,
  max,
  step,
  fieldId,
  unit,
  units,
  className,
}: NumberFieldProps<U>) {
  const generatedId = useId();
  const id = fieldId ?? generatedId;
  // The hint stays while the field is wrong: what the field wants is most needed then.
  const describedBy =
    [invalid && errorText ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  const unitLabel = units ? units.options.find((option) => option.value === units.value)?.label : unit;
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {/* The unit is on screen beside the number; the field's name carries it for a screen reader. */}
        {unitLabel && <span className="sr-only"> ({unitLabel})</span>}
      </label>
      <div
        className={cn(
          'flex min-h-12 items-stretch rounded-lg border bg-background focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
          invalid ? 'border-destructive' : 'border-outline',
        )}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step ?? 'any'}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="min-w-[5ch] flex-1 !rounded-lg !border-0 !pr-1 !outline-none"
        />
        {units ? (
          <select
            value={units.value}
            onChange={(event) => units.onChange(event.target.value as U)}
            aria-label={units.label}
            // Narrow padding: beside a number in a two-column row on a phone, the default padding and
            // arrow left the number two digits of room.
            className="!w-auto shrink-0 !rounded-l-none !rounded-r-lg !border-0 !border-l !border-solid !border-outline-variant bg-surface-container-low !min-w-12 !pl-2 !pr-1 text-sm !outline-none"
          >
            {units.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          unit && (
            <span className="flex shrink-0 items-center pr-3 text-sm text-on-surface-variant" aria-hidden="true">
              {unit}
            </span>
          )
        )}
      </div>
      {invalid && errorText && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errorText}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly FieldOption<T>[];
  hint?: ReactNode;
  fieldId?: string;
  className?: string;
}

export function SelectField<T extends string = string>({
  label,
  value,
  onChange,
  options,
  hint,
  fieldId,
  className,
}: SelectFieldProps<T>) {
  const generatedId = useId();
  const id = fieldId ?? generatedId;
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-on-surface-variant">
          {hint}
        </p>
      )}
    </div>
  );
}
