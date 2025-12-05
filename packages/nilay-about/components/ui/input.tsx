"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Material Design 3 Text Field (Outlined variant)
 *
 * M3 Specifications:
 * - Height: 56dp
 * - Corner radius: 4dp (extra-small)
 * - Border: 1dp outline (2dp on focus)
 * - Padding: 16dp horizontal
 * - Typography: Body Large (16sp)
 *
 * States:
 * - Default: outline color
 * - Hover: on-surface color border
 * - Focus: primary color border (2dp)
 * - Disabled: 38% opacity
 * - Error: error color border
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // M3 base styles
          "flex h-14 w-full", // 56dp height
          "rounded", // 4dp corner radius (extra-small)
          "border border-outline bg-transparent",
          "px-4 py-4", // 16dp padding
          "text-base leading-6", // Body Large: 16sp
          "text-on-surface",
          "placeholder:text-on-surface-variant",
          // Transitions
          "transition-[border-color,border-width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          // Hover state
          "hover:border-on-surface",
          // Focus state - M3 uses thicker border, not ring
          "focus:outline-none focus:border-primary focus:border-2 focus:px-[15px] focus:py-[15px]", // Compensate for 2px border
          // Disabled state
          "disabled:cursor-not-allowed disabled:opacity-[0.38] disabled:bg-surface-variant",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
