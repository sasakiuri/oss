'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SegmentedOption {
  value: string;
  label: ReactNode;
}

interface SegmentedControlProps {
  /** Names the choice for a screen reader, and labels it on screen. */
  legend: string;
  value: string;
  options: readonly SegmentedOption[];
  onChange: (value: string) => void;
  /**
   * `horizontal` stacks on a phone and sits side by side from `sm` up. `inline` stays in one row at
   * every width, for a few short labels (units, a mode in a word or two) where stacking would spend
   * a hand's height of the screen on one choice. `vertical` for a narrow column, where side-by-side
   * labels would be squeezed to a few characters.
   */
  orientation?: 'horizontal' | 'inline' | 'vertical';
}

/**
 * A set of choices shown as one connected control.
 *
 * Built on real radio inputs, so arrow keys move between the choices and the group is announced as
 * a group. The earlier shape — the chosen option as a filled pill and the rest as plain links —
 * read as one button followed by unrelated links, and took a column of height to say one thing.
 */
export function SegmentedControl({
  legend,
  value,
  options,
  onChange,
  orientation = 'horizontal',
}: SegmentedControlProps) {
  const name = useId();

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div
        className={cn(
          'flex gap-1 rounded-lg bg-surface-container p-1',
          orientation === 'inline' ? 'flex-row' : 'flex-col',
          orientation === 'horizontal' && 'sm:flex-row',
        )}
      >
        {options.map((option) => (
          <label key={option.value} className="min-w-0 flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-center rounded-md px-3 text-center text-sm',
                'peer-checked:bg-primary peer-checked:font-medium peer-checked:text-on-primary',
                'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary',
                'hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)] peer-checked:hover:bg-primary',
              )}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
