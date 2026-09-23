'use client';

import { useState } from 'react';

import { NumberField } from '@/components/labs';

type SharedProps<U extends string> = Parameters<typeof NumberField<U>>[0];

type RoundedNumberFieldProps<U extends string> = Omit<SharedProps<U>, 'value' | 'onChange'> & {
  /** Null for a field left blank on purpose, such as an optional diameter. */
  value: number | null;
  onChange: (value: number | null) => void;
  /** Decimals shown while the field is not being typed in. */
  digits?: number;
};

/**
 * The Labs number field, showing a rounded value until it is typed in.
 *
 * The measuring tools print lengths that come out of a calculation — a point in pixels times the
 * scale, a reference converted to inches — and read to a dozen decimals. Rounded at every render,
 * the field would round the reader's own typing too, so what they type is shown as typed until the
 * field loses focus.
 */
export function RoundedNumberField<U extends string = string>({
  value,
  onChange,
  digits = 2,
  ...props
}: RoundedNumberFieldProps<U>) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? (value === null || !Number.isFinite(value) ? NaN : Number(value.toFixed(digits)));
  return (
    // Blur bubbles in React, so the wrapper hears the field lose focus without the shared field
    // having to offer a handler for it.
    <div className="min-w-0" onBlur={() => setDraft(null)}>
      <NumberField<U>
        {...props}
        value={shown}
        onChange={(next) => {
          setDraft(next);
          onChange(Number.isNaN(next) ? null : next);
        }}
      />
    </div>
  );
}
