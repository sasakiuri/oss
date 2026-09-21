import 'server-only';

import { createRoute, RequestError, type RouteDependencies } from '@/lib/server/http';
import { rateLimitPresets } from '@/lib/server/rate-limit';

import { newsQuerySchema } from '../schema';

import type { NewsRepository } from './repository';

const routeOptions = { rateLimit: rateLimitPresets.apiRead, failureMessage: 'Failed to fetch news' };

export function createNewsHandlers(repository: NewsRepository, dependencies?: RouteDependencies) {
  return {
    list: createRoute(
      routeOptions,
      async (request) => {
        const params = new URL(request.url).searchParams;
        const query = newsQuerySchema.safeParse({
          limit: params.get('limit') ?? undefined,
          offset: params.get('offset') ?? undefined,
        });
        if (!query.success) throw new RequestError(400, 'Invalid query parameters');
        return Response.json({ newsList: await repository.list(query.data) });
      },
      dependencies,
    ),
    detail: createRoute<{ params: Promise<{ id: string }> }>(
      routeOptions,
      async (_request, context) => {
        const { id } = await context.params;
        const news = await repository.find(id);
        if (!news) throw new RequestError(404, 'News not found');
        return Response.json({ news });
      },
      dependencies,
    ),
  };
}
