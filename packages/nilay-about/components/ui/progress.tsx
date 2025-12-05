"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
}

/**
 * Material Design 3 Linear Progress Indicator
 *
 * M3 Specifications:
 * - Track height: 4dp
 * - Indicator height: 4dp
 * - Corner radius: Track has rounded ends (2dp)
 * - Track color: surface-container-highest
 * - Indicator color: primary
 *
 * Variants:
 * - Determinate: Shows specific progress
 * - Indeterminate: Shows ongoing activity
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indeterminate = false, ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          "relative h-1 w-full overflow-hidden",
          "rounded-full", // M3: rounded ends
          "bg-surface-container-highest", // M3 track color
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full", // M3: rounded indicator
            "bg-primary",
            "transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
            indeterminate && "animate-[progress-indeterminate_2s_ease-in-out_infinite]"
          )}
          style={indeterminate ? { width: "50%" } : { width: `${percentage}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
