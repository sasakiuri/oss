'use client';

import * as React from 'react';
import { LuCheck } from 'react-icons/lu';

import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /** Callback when checked state changes (Radix-compatible API) */
  onCheckedChange?: (checked: boolean) => void;
  /** Standard onChange handler */
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

/**
 * Material Design 3 Checkbox
 *
 * M3 Specifications:
 * - Container size: 18dp x 18dp
 * - Corner radius: 2dp
 * - Touch target: 48dp x 48dp (handled by parent)
 * - Unchecked: outline border
 * - Checked: primary fill with checkmark
 *
 * States:
 * - Unchecked/Checked
 * - Hover: 8% state layer
 * - Focus: focus ring
 * - Disabled: 38% opacity
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <div className="relative inline-flex items-center justify-center h-12 w-12 -m-3">
        {/* State layer for hover/focus */}
        <div className="absolute h-10 w-10 rounded-full peer-hover:bg-primary/8 peer-focus-visible:bg-primary/12 transition-colors" />

        <input
          type="checkbox"
          className={cn(
            'peer',
            'h-[18px] w-[18px] shrink-0', // M3: 18dp size
            'rounded-sm', // M3: 2dp corner radius
            'border-2 border-outline', // M3: outline border
            'appearance-none bg-transparent',
            'transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
            // Checked state
            'checked:bg-primary checked:border-primary',
            // Focus state
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            // Disabled state
            'disabled:cursor-not-allowed disabled:opacity-[0.38]',
            className,
          )}
          ref={ref}
          onChange={handleChange}
          {...props}
        />

        {/* Checkmark icon */}
        <LuCheck
          className={cn(
            'absolute h-3.5 w-3.5 pointer-events-none',
            'text-on-primary',
            'opacity-0 scale-50',
            'peer-checked:opacity-100 peer-checked:scale-100',
            'transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]',
          )}
          strokeWidth={3}
        />
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
