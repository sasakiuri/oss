"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { sendContactMessage } from "@/lib/api/contact";
import { mutationConfig } from "@/lib/api/query-config";
import { useUIStore } from "@/store/ui-store";
import type { ContactFormData, ContactResponse } from "@/lib/schemas";
import { useCallback } from "react";

type ContactMutationOptions = Omit<
  UseMutationOptions<ContactResponse, Error, ContactFormData>,
  "mutationFn"
>;

/**
 * Basic hook for contact form mutation
 */
export function useContactForm(options?: ContactMutationOptions) {
  return useMutation({
    mutationFn: sendContactMessage,
    ...mutationConfig.contact,
    ...options,
  });
}

/**
 * Convenience hook with built-in success/error handling
 */
export function useContactFormWithCallbacks(callbacks?: {
  onSuccess?: (data: ContactResponse) => void;
  onError?: (error: Error) => void;
}) {
  return useMutation({
    mutationFn: sendContactMessage,
    ...mutationConfig.contact,
    onSuccess: (data) => {
      if (!data.hasError) {
        callbacks?.onSuccess?.(data);
      }
    },
    onError: callbacks?.onError,
  });
}

interface UseContactFormWithUIOptions {
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: ContactResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Contact form hook with integrated UI feedback
 * Automatically shows alerts on success/error
 */
export function useContactFormWithUI(options?: UseContactFormWithUIOptions) {
  const showAlert = useUIStore((state) => state.showAlert);

  const handleSuccess = useCallback(
    (data: ContactResponse) => {
      if (data.hasError) {
        showAlert(
          data.errorMessage || options?.errorMessage || "送信に失敗しました",
          "error"
        );
        return;
      }

      showAlert(
        options?.successMessage || "お問い合わせを送信しました。",
        "success"
      );
      options?.onSuccess?.(data);
    },
    [showAlert, options]
  );

  const handleError = useCallback(
    (error: Error) => {
      showAlert(
        options?.errorMessage || error.message || "送信に失敗しました",
        "error"
      );
      options?.onError?.(error);
    },
    [showAlert, options]
  );

  return useMutation({
    mutationFn: sendContactMessage,
    ...mutationConfig.contact,
    onSuccess: handleSuccess,
    onError: handleError,
  });
}
