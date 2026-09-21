import 'server-only';

import { createRoute, readJson, RequestError, type RouteDependencies } from '@/lib/server/http';
import { rateLimitPresets } from '@/lib/server/rate-limit';

import { contactFormSchema, type ContactFormData } from '../schema';

export type DeliverContact = (data: ContactFormData, id: string) => Promise<void>;

export function createContactHandler(
  deliver: DeliverContact,
  dependencies?: RouteDependencies,
  createId: () => string = () => crypto.randomUUID(),
) {
  return createRoute(
    {
      rateLimit: rateLimitPresets.contact,
      failureMessage: '送信に失敗しました。しばらく時間をおいてから再度お試しください。',
      errorBody: (errorMessage) => ({ hasError: true, errorMessage, uuid: '' }),
    },
    async (request) => {
      const result = contactFormSchema.safeParse(await readJson(request));
      if (!result.success) throw new RequestError(400, '入力内容に誤りがあります。');
      const uuid = createId();
      await deliver(result.data, uuid);
      return Response.json({ hasError: false, errorMessage: '', uuid });
    },
    dependencies,
  );
}
