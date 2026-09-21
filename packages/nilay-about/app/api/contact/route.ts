import { createContactHandler } from '@/features/contact/server/handler';
import { createSlackDelivery } from '@/features/contact/server/slack';
import { env } from '@/lib/env';

const handler = createContactHandler(createSlackDelivery({ getWebhookUrl: () => env.SLACK_WEBHOOK_URL }));
export async function POST(request: Request) {
  return handler(request, undefined);
}
