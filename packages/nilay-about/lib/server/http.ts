import 'server-only';

import { createRequestLogger } from '@/lib/logging';

import { checkRateLimit, type RateLimitConfig } from './rate-limit';
import { getClientIp } from './request';

export class RequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export interface RouteDependencies {
  checkRateLimit: typeof checkRateLimit;
  createLogger: typeof createRequestLogger;
}

const defaultDependencies: RouteDependencies = { checkRateLimit, createLogger: createRequestLogger };

type ErrorBody = (message: string) => object;

/** A single HTTP boundary for rate limits, safe errors, and request logging. */
export function createRoute<Context = unknown>(
  options: {
    rateLimit: RateLimitConfig;
    failureMessage: string;
    errorBody?: ErrorBody;
  },
  handle: (request: Request, context: Context) => Promise<Response>,
  dependencies: RouteDependencies = defaultDependencies,
) {
  return async (request: Request, context: Context): Promise<Response> => {
    const log = dependencies.createLogger(request);
    const errorBody = options.errorBody ?? ((error: string) => ({ error }));
    try {
      const limit = await dependencies.checkRateLimit(getClientIp(request), options.rateLimit);
      if (!limit.allowed) {
        log.warn('Rate limit exceeded', { resetIn: limit.resetIn });
        return Response.json(errorBody('リクエストが多すぎます。しばらくしてからお試しください。'), {
          status: 429,
          headers: {
            'Retry-After': String(Math.max(1, Math.ceil(limit.resetIn / 1000))),
            'X-RateLimit-Remaining': String(limit.remaining),
          },
        });
      }
      return await handle(request, context);
    } catch (error) {
      if (error instanceof RequestError) {
        log.warn('Request failed', { status: error.status });
        return Response.json(errorBody(error.message), { status: error.status });
      }
      // Do not log dependency errors: driver messages can contain credentials or submitted content.
      log.error('Unexpected request failure');
      return Response.json(errorBody(options.failureMessage), { status: 500 });
    }
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RequestError(400, 'リクエストの形式が不正です。');
  }
}
