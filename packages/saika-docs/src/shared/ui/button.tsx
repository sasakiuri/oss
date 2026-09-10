// SPDX-License-Identifier: MIT
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/classes';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand px-4 text-white hover:bg-brand-strong dark:text-surface',
        outline: 'border border-line bg-surface px-4 text-ink hover:bg-muted',
        ghost: 'px-3 text-subtle hover:bg-muted hover:text-ink',
      },
      size: { default: 'h-11', icon: 'size-11 p-0' },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ asChild, className, variant, size, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function DisabledAction({ reason, children }: { reason: string; children: React.ReactNode }) {
  return (
    <span className="inline-grid gap-1">
      <Button disabled title={reason}>
        {children}
      </Button>
      <span className="text-subtle text-xs">{reason}</span>
    </span>
  );
}
