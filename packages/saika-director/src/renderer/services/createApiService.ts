import { Logger } from '@/shared/utils/Logger';
import { createServiceMethod } from './createServiceMethod';

type ApiNamespace = keyof Omit<typeof window.electronAPI, 'appVersion' | 'on'>;
type BridgeMethod = (...args: unknown[]) => Promise<unknown>;

export function createApiService<N extends ApiNamespace>(namespace: N): (typeof window.electronAPI)[N] {
  const logger = Logger.create(namespace);
  // One wrapper per property; a replaced bridge function gets a new one.
  const wrapped = new Map<string, { readonly fn: BridgeMethod; readonly method: BridgeMethod }>();

  return new Proxy({} as (typeof window.electronAPI)[N], {
    get(_target, prop: string) {
      const ns = window.electronAPI[namespace] as Record<string, unknown>;
      const fn = ns[prop];
      if (typeof fn !== 'function') return fn;
      const cached = wrapped.get(prop);
      if (cached?.fn === fn) return cached.method;
      const method = createServiceMethod(logger, prop, (fn as BridgeMethod).bind(ns));
      wrapped.set(prop, { fn: fn as BridgeMethod, method });
      return method;
    },
  }) as (typeof window.electronAPI)[N];
}
