import { createNewsHandlers } from '@/features/news/server/handlers';
import { newsRepository } from '@/features/news/server/repository';

const handlers = createNewsHandlers(newsRepository);
export async function GET(request: Request) {
  return handlers.list(request, undefined);
}
