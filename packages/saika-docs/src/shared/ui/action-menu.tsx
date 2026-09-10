// SPDX-License-Identifier: MIT
'use client';
import * as Primitive from '@radix-ui/react-dropdown-menu';

import { Button } from './button';

export function ActionMenu({
  label = '操作',
  actions,
}: {
  label?: string;
  actions: { label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>
        <Button variant="outline">{label}</Button>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          sideOffset={4}
          className="border-line bg-surface text-ink z-60 min-w-40 rounded-lg border p-1 shadow-lg"
        >
          {actions.map((action) => (
            <Primitive.Item
              key={action.label}
              onSelect={action.onSelect}
              disabled={action.disabled}
              className="data-highlighted:bg-muted min-h-11 cursor-default rounded px-3 py-2 outline-none data-disabled:opacity-50"
            >
              {action.label}
            </Primitive.Item>
          ))}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
