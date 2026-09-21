import { useMutation } from '@tanstack/react-query';

import { sendContactMessage } from './client';

export function useContactForm() {
  // A timed-out submission may already have reached Slack. Never resend automatically.
  return useMutation({ mutationFn: sendContactMessage, retry: false });
}
