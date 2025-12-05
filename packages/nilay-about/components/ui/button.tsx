"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Material Design 3 Button Component
 *
 * M3 Button Specifications:
 * - Height: 40dp
 * - Corner radius: 20dp (full rounded)
 * - Horizontal padding: 24dp (16dp for icon buttons)
 * - Typography: Label Large (14sp, 500 weight)
 * - State layers: 8% hover, 12% focus, 12% pressed
 *
 * Button Types:
 * - filled (default): Primary action, highest emphasis
 * - outlined: Medium emphasis, bordered
 * - text: Low emphasis, no container
 * - elevated: Elevated with shadow, medium-high emphasis
 * - tonal: Filled tonal, secondary action
 * - destructive: Error/delete actions
 */
const buttonVariants = cva(
  // Base styles aligned with M3 specifications
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-full", // M3: 20dp corner radius = full rounded
    "text-sm font-medium", // Label Large: 14sp, 500 weight
    "transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-[0.38]", // M3: 38% opacity when disabled
    "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0", // M3: 18dp icons
  ].join(" "),
  {
    variants: {
      variant: {
        // M3 Filled Button (Primary)
        default: [
          "bg-primary text-primary-foreground",
          "hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)]", // elevation 1 on hover
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_8%,var(--md-sys-color-primary))]", // 8% state layer
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_12%,var(--md-sys-color-primary))]", // 12% pressed
        ].join(" "),

        // M3 Outlined Button
        outline: [
          "border border-outline bg-transparent text-primary",
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]", // 8% primary overlay
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_12%,transparent)]",
        ].join(" "),

        // M3 Text Button
        ghost: [
          "bg-transparent text-primary",
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,transparent)]",
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_12%,transparent)]",
        ].join(" "),

        // M3 Elevated Button
        elevated: [
          "bg-surface-container-low text-primary shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)]",
          "hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_2px_rgba(0,0,0,0.15)]", // elevation 2
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_8%,var(--md-sys-color-surface-container-low))]",
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-primary)_12%,var(--md-sys-color-surface-container-low))]",
        ].join(" "),

        // M3 Filled Tonal Button (Secondary)
        secondary: [
          "bg-secondary-container text-on-secondary-container",
          "hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)]",
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-secondary-container)_8%,var(--md-sys-color-secondary-container))]",
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-on-secondary-container)_12%,var(--md-sys-color-secondary-container))]",
        ].join(" "),

        // M3 Error/Destructive Button
        destructive: [
          "bg-destructive text-destructive-foreground",
          "hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)]",
          "hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-error)_8%,var(--md-sys-color-error))]",
          "active:bg-[color-mix(in_srgb,var(--md-sys-color-on-error)_12%,var(--md-sys-color-error))]",
        ].join(" "),

        // Link style (non-M3, but useful)
        link: "text-primary underline-offset-4 hover:underline bg-transparent",
      },
      size: {
        // M3 standard button: 40dp height, 24dp horizontal padding
        default: "h-10 px-6 py-2.5",
        // Smaller variant (for dense layouts)
        sm: "h-9 px-4 py-2 text-xs",
        // Larger variant
        lg: "h-12 px-8 py-3",
        // Icon-only button: 40dp x 40dp
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
