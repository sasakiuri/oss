"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Material Design 3 Card Component
 *
 * M3 Card Specifications:
 * - Corner radius: 12dp (medium)
 * - Padding: 16dp
 *
 * Card Types:
 * - elevated: Surface with elevation 1, no outline
 * - filled: Surface-container-highest with no elevation
 * - outlined: Surface with 1dp outline, no elevation
 */
const cardVariants = cva(
  [
    "rounded-xl", // M3: 12dp corner radius
    "text-foreground",
    "transition-shadow duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
  ].join(" "),
  {
    variants: {
      variant: {
        // M3 Elevated Card - elevation level 1, surface tint
        elevated: [
          "bg-[color-mix(in_srgb,var(--md-sys-color-primary)_5%,var(--md-sys-color-surface))]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.3),0_1px_3px_1px_rgba(0,0,0,0.15)]",
          "hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_2px_6px_2px_rgba(0,0,0,0.15)]",
        ].join(" "),

        // M3 Filled Card - surface-container-highest, no elevation
        filled: "bg-surface-container-highest",

        // M3 Outlined Card - surface with outline, no elevation
        outlined: "bg-surface border border-outline-variant",
      },
    },
    defaultVariants: {
      variant: "elevated",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
);
Card.displayName = "Card";

/**
 * M3 Card Header
 * Padding: 16dp
 */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4", className)} // M3: 16dp padding
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

/**
 * M3 Card Title
 * Typography: Title Large (22sp)
 */
const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-[22px] leading-7 font-normal tracking-normal", // M3 Title Large
      "text-on-surface",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

/**
 * M3 Card Description/Subhead
 * Typography: Body Medium (14sp)
 */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-sm leading-5 text-on-surface-variant", // M3 Body Medium
      className
    )}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

/**
 * M3 Card Content
 * Padding: 16dp (0 top when following header)
 */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

/**
 * M3 Card Footer/Actions
 * Typically contains action buttons
 * Padding: 16dp, buttons aligned to end
 */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center justify-end gap-2 p-4 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
