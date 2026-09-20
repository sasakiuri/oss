'use client';

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useCallback } from 'react';

import { sendContactMessage } from '@/lib/api/contact';
import { mutationConfig } from '@/lib/api/query-config';
import type { ContactFormData, ContactResponse } from '@/lib/schemas';
import { useUIStore } from '@/store/ui-store';

type ContactMutationOptions = Omit<UseMutationOptions<ContactResponse, Error, ContactFormData>, 'mutationFn'>;

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
  const { showError, showSuccess } = useUIStore();

  const handleSuccess = useCallback(
    (data: ContactResponse) => {
      if (data.hasError) {
        showError('送信エラー', data.errorMessage || options?.errorMessage || '送信に失敗しました');
        return;
      }

      showSuccess('送信完了', options?.successMessage || 'お問い合わせを送信しました。');
      options?.onSuccess?.(data);
    },
    [showError, showSuccess, options],
  );

  const handleError = useCallback(
    (error: Error) => {
      showError('送信エラー', options?.errorMessage || error.message || '送信に失敗しました');
      options?.onError?.(error);
    },
    [showError, options],
  );

  return useMutation({
    mutationFn: sendContactMessage,
    ...mutationConfig.contact,
    onSuccess: handleSuccess,
    onError: handleError,
  });
}
