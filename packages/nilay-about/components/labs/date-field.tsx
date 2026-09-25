'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface DateFieldProps {
  label: string;
  /** An ISO date, or empty. */
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  errorText?: string;
  invalid?: boolean;
  fieldId?: string;
  className?: string;
}

/** A calendar date, as the browser's own date picker. The value is an ISO date or empty. */
export function DateField({
  label,
  value,
  onChange,
  hint,
  errorText,
  invalid = false,
  fieldId,
  className,
}: DateFieldProps) {
  const generatedId = useId();
  const id = fieldId ?? generatedId;
  const describedBy =
    [invalid && errorText ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('min-w-0 space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
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
