import { requestJson, HttpError } from '@/lib/http/client';

import { contactResponseSchema, type ContactFormData } from './schema';

export async function sendContactMessage(data: ContactFormData) {
  const result = await requestJson('/api/contact', contactResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (result.hasError) throw new HttpError(502, result.errorMessage);
  return result;
}
