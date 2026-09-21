import { createNewsHandlers } from '@/features/news/server/handlers';
import { newsRepository } from '@/features/news/server/repository';

export const GET = createNewsHandlers(newsRepository).detail;
