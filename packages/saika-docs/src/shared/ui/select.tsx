// SPDX-License-Identifier: MIT
'use client';
import * as Primitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';

export function Select({
  label,
  value,
  onValueChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Primitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
        <Primitive.Trigger
          id={id}
          className="border-line bg-surface focus-visible:outline-brand flex min-h-11 items-center justify-between gap-4 rounded-lg border px-3 focus-visible:outline-2"
        >
          <Primitive.Value />
          <Primitive.Icon>
            <ChevronDown size={16} aria-hidden="true" />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            position="popper"
            sideOffset={4}
            className="bg-surface border-line text-ink z-60 min-w-40 rounded-lg border p-1 shadow-lg"
          >
            <Primitive.Viewport>
              {options.map((option) => (
                <Primitive.Item
                  key={option.value}
                  value={option.value}
                  className="data-highlighted:bg-muted flex min-h-11 cursor-default items-center gap-2 rounded px-3 outline-none"
                >
                  <Primitive.ItemText>{option.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator>
                    <Check size={16} aria-hidden="true" />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </div>
  );
}
