"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { LuCheck } from "react-icons/lu";

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          className={cn(
            "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none bg-background checked:bg-primary checked:border-primary",
            className
          )}
          ref={ref}
          {...props}
        />
        <LuCheck className="absolute h-3 w-3 text-primary-foreground pointer-events-none left-0.5 hidden peer-checked:block" />
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
