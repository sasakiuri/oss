import { vi, type Mock } from 'vitest';
import type * as Services from '@/renderer/services';

type ServiceModule = typeof Services;

type MockedService<S> = {
  [M in keyof S]: S[M] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : S[M];
};

export type MockedServices = { [K in keyof ServiceModule]: MockedService<ServiceModule[K]> };

/**
 * Module factory for the renderer services. `vi.mock` is hoisted above the imports, so load it inside the factory:
 *
 * ```ts
 * vi.mock('@/renderer/services', async () => (await import('<relative path>/mockServices')).mockServices());
 * ```
 *
 * Every service of the real module is replaced by an object whose methods are `vi.fn()` mocks created on first use.
 * A method the test does not configure returns a promise that never settles, so panels outside the test stay in their
 * loading state instead of failing on an undefined response. Configure methods with `vi.mocked(...)` and the
 * responses from `serviceResponses.ts`.
 */
export async function mockServices(): Promise<MockedServices> {
  const actual = await vi.importActual<ServiceModule>('@/renderer/services');
  return Object.fromEntries(Object.keys(actual).map((name) => [name, mockService()])) as MockedServices;
}

function mockService(): Record<string, Mock> {
  const methods = new Map<string, Mock>();
  return new Proxy({} as Record<string, Mock>, {
    get(_target, property) {
      if (typeof property !== 'string' || property === 'then') return undefined;
      let method = methods.get(property);
      if (!method) {
        method = vi.fn(() => new Promise<never>(() => {}));
        methods.set(property, method);
      }
      return method;
    },
  });
}
