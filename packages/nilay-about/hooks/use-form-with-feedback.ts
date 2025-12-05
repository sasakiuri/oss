"use client";

import { useForm, type UseFormProps, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { useUIActions } from "@/store";
import type { ZodSchema } from "zod";

interface FormFeedbackMessages {
  successTitle?: string;
  successMessage?: string | ((data: unknown) => string);
  errorTitle?: string;
  errorMessage?: string;
}

interface UseFormWithFeedbackOptions<TInput extends FieldValues, TOutput> {
  schema: ZodSchema<TInput>;
  defaultValues: TInput;
  mutationFn: (data: TInput) => Promise<TOutput>;
  onSuccess?: (data: TOutput, reset: () => void) => void;
  onError?: (error: Error) => void;
  messages?: FormFeedbackMessages;
  resetOnSuccess?: boolean;
  mutationOptions?: Omit<UseMutationOptions<TOutput, Error, TInput>, "mutationFn">;
}

/**
 * Custom hook that combines react-hook-form with TanStack Query mutation
 * and automatic UI feedback via Zustand store
 */
export function useFormWithFeedback<TInput extends FieldValues, TOutput>({
  schema,
  defaultValues,
  mutationFn,
  onSuccess,
  onError,
  messages = {},
  resetOnSuccess = true,
  mutationOptions,
}: UseFormWithFeedbackOptions<TInput, TOutput>) {
  const { showSuccess, showError } = useUIActions();

  const form = useForm<TInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as UseFormProps<TInput>["defaultValues"],
  });

  const mutation = useMutation({
    mutationFn,
    onSuccess: (data) => {
      const successMessage =
        typeof messages.successMessage === "function"
          ? messages.successMessage(data)
          : messages.successMessage || "操作が完了しました";

      showSuccess(messages.successTitle || "成功", successMessage);

      if (resetOnSuccess) {
        form.reset();
      }

      onSuccess?.(data, form.reset);
    },
    onError: (error) => {
      showError(
        messages.errorTitle || "エラー",
        messages.errorMessage || error.message || "エラーが発生しました"
      );
      onError?.(error);
    },
    ...mutationOptions,
  });

  const handleSubmit = form.handleSubmit((data) => {
    mutation.mutate(data);
  });

  const isLoading = form.formState.isSubmitting || mutation.isPending;

  return {
    form,
    mutation,
    handleSubmit,
    isLoading,
    register: form.register,
    errors: form.formState.errors,
    watch: form.watch,
    setValue: form.setValue,
    reset: form.reset,
    getFieldState: (name: Path<TInput>) => ({
      error: form.formState.errors[name],
      isDirty: form.formState.dirtyFields[name],
      isTouched: form.formState.touchedFields[name],
    }),
  };
}
