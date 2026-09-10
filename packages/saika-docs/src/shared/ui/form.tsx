// SPDX-License-Identifier: MIT
'use client';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '../lib/classes';

import { Button } from './button';

export const fieldClass =
  'border-line bg-surface min-h-11 w-full rounded-lg border px-3 py-2 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50';
export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-sm text-red-700 dark:text-red-300">
      {children}
    </p>
  );
}
export function RequiredMark() {
  return <span className="text-subtle ml-2 text-xs">必須</span>;
}
type FieldProps = { label: string; error?: string; hint?: string };
export function TextField({
  label,
  error,
  hint,
  id: suppliedId,
  className,
  ...props
}: FieldProps & ComponentProps<'input'>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {props.required && <RequiredMark />}
      </label>
      <input
        {...props}
        id={id}
        className={cn(fieldClass, className)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-subtle text-sm">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
export function TextAreaField({
  label,
  error,
  hint,
  id: suppliedId,
  ...props
}: FieldProps & ComponentProps<'textarea'>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className="grid gap-2">
      <label htmlFor={id}>
        {label}
        {props.required && <RequiredMark />}
      </label>
      <textarea
        {...props}
        id={id}
        className={fieldClass}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && <p id={`${id}-hint`}>{hint}</p>}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
export function NumberInput(props: FieldProps & Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <TextField
      min={0}
      {...props}
      type="number"
      inputMode="numeric"
      onWheel={(event) => {
        event.currentTarget.blur();
        props.onWheel?.(event);
      }}
    />
  );
}
export function CheckboxGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 font-medium">{label}</legend>
      {options.map((option) => (
        <label key={option} className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={value.includes(option)}
            onChange={(event) =>
              onChange(event.target.checked ? [...value, option] : value.filter((entry) => entry !== option))
            }
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4">
      <legend className="mb-4 text-lg font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
export function FormActions({ busy = false, onCancel }: { busy?: boolean; onCancel?: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? '保存中…' : '保存'}
      </Button>
    </div>
  );
}
export function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-subtle text-sm">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
