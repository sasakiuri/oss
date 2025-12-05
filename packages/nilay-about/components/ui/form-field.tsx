"use client";

import * as React from "react";
import { createContext, useContext, useId, useMemo } from "react";
import { Label } from "./label";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { cn } from "@/lib/utils";

// Form Field Context for automatic aria attributes
interface FormFieldContextValue {
  id: string;
  errorId: string;
  descriptionId: string;
  hasError: boolean;
  hasDescription: boolean;
}

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

function useFormFieldContext() {
  const context = useContext(FormFieldContext);
  if (!context) {
    throw new Error("useFormFieldContext must be used within FormField");
  }
  return context;
}

// Hook for building aria-describedby
export function useFieldAriaDescribedBy(): string | undefined {
  const { errorId, descriptionId, hasError, hasDescription } = useFormFieldContext();
  const parts = [hasError && errorId, hasDescription && descriptionId].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

interface FormFieldProps {
  id?: string;
  label: string;
  error?: string;
  required?: boolean;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function FormField({
  id: providedId,
  label,
  error,
  required,
  description,
  children,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;

  const contextValue = useMemo<FormFieldContextValue>(
    () => ({
      id,
      errorId,
      descriptionId,
      hasError: !!error,
      hasDescription: !!description,
    }),
    [id, errorId, descriptionId, error, description]
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div className={cn("space-y-2", className)} role="group" aria-labelledby={`${id}-label`}>
        <Label htmlFor={id} id={`${id}-label`}>
          {label}
          {required && (
            <span className="text-destructive ml-1" aria-hidden="true">
              *
            </span>
          )}
          {required && <span className="sr-only">（必須）</span>}
        </Label>
        {description && (
          <p id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
        {children}
        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}

interface FormInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  description?: string;
}

export function FormInput({
  id,
  label,
  error,
  required,
  description,
  className,
  ...props
}: FormInputProps) {
  const errorId = `${id}-error`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <FormField
      id={id}
      label={label}
      error={error}
      required={required}
      description={description}
    >
      <Input
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={
          [error && errorId, descriptionId].filter(Boolean).join(" ") ||
          undefined
        }
        className={cn(error && "border-destructive", className)}
        {...props}
      />
    </FormField>
  );
}

interface FormTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id: string;
  label: string;
  error?: string;
  description?: string;
}

export function FormTextarea({
  id,
  label,
  error,
  required,
  description,
  className,
  ...props
}: FormTextareaProps) {
  const errorId = `${id}-error`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <FormField
      id={id}
      label={label}
      error={error}
      required={required}
      description={description}
    >
      <Textarea
        id={id}
        required={required}
        aria-invalid={!!error}
        aria-describedby={
          [error && errorId, descriptionId].filter(Boolean).join(" ") ||
          undefined
        }
        className={cn(error && "border-destructive", className)}
        {...props}
      />
    </FormField>
  );
}
