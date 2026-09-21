import 'server-only';

/**
 * Header precedence shared by rate limiting and request logging.
 * These headers must be overwritten by the trusted ingress proxy; their names
 * alone do not make values from a direct client trustworthy.
 */
export function getClientIp(request: Request): string {
  for (const name of ['x-vercel-forwarded-for', 'cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']) {
    const address = request.headers.get(name)?.split(',')[0]?.trim();
    if (address) return address;
  }
  return '127.0.0.1';
}
