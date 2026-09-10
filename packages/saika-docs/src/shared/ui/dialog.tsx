// SPDX-License-Identifier: MIT
'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/classes';
import { Button } from '@/shared/ui/button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
  side?: boolean;
  busy?: boolean;
}

export function Dialog({ open, onOpenChange, trigger, title, description, children, side, busy = false }: DialogProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
    >
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-busy={busy}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          className={cn(
            'border-line bg-surface fixed z-50 overflow-y-auto border p-5 shadow-xl focus:outline-none',
            side
              ? 'inset-y-0 left-0 w-80 max-w-[90vw]'
              : 'top-[12vh] left-1/2 max-h-[76vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-2xl',
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="閉じる" disabled={busy}>
                <X size={20} aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
