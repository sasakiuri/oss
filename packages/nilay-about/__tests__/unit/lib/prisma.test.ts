import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  adapter: vi.fn(),
}));

vi.mock('@/lib/generated/prisma/client', () => ({ PrismaClient: mocks.client }));
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: mocks.adapter }));

describe('Prisma runtime initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('loads route dependencies without database credentials during a build', async () => {
    await import('@/lib/prisma');
    expect(mocks.adapter).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('requires credentials when a request actually needs the database', async () => {
    const { getPrisma } = await import('@/lib/prisma');
    expect(() => getPrisma()).toThrow('DATABASE_URL environment variable is not set');
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it('constructs and reuses the client with the configured runtime URL', async () => {
    const url = 'postgresql://127.0.0.1:9/nilay_about';
    vi.stubEnv('DATABASE_URL', url);
    const { getPrisma } = await import('@/lib/prisma');
    const first = getPrisma();
    expect(getPrisma()).toBe(first);
    expect(mocks.adapter).toHaveBeenCalledWith({ connectionString: url });
    expect(mocks.client).toHaveBeenCalledOnce();
  });
});
