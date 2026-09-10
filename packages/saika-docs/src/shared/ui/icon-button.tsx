// SPDX-License-Identifier: MIT
'use client';

import * as Tooltip from '@radix-ui/react-tooltip';

import { Button, type ButtonProps } from '@/shared/ui/button';

export function IconButton({ label, ...props }: ButtonProps & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} {...props} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="bg-ink text-surface z-50 rounded-md px-3 py-2 text-xs">
          {label}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
