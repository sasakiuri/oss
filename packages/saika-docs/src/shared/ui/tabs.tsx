// SPDX-License-Identifier: MIT
'use client';
import * as Primitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export function Tabs({ label, items }: { label: string; items: { id: string; label: string; content: ReactNode }[] }) {
  return (
    <Primitive.Root defaultValue={items[0]?.id}>
      <Primitive.List aria-label={label} className="border-line flex gap-2 border-b">
        {items.map((item) => (
          <Primitive.Trigger
            key={item.id}
            value={item.id}
            className="data-[state=active]:border-brand min-h-11 border-b-2 border-transparent px-4 font-medium"
          >
            {item.label}
          </Primitive.Trigger>
        ))}
      </Primitive.List>
      {items.map((item) => (
        <Primitive.Content
          key={item.id}
          value={item.id}
          className="focus-visible:outline-brand py-4 focus-visible:outline-2"
        >
          {item.content}
        </Primitive.Content>
      ))}
    </Primitive.Root>
  );
}
