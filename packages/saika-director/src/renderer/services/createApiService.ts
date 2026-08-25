import { Logger } from '@/shared/utils/Logger';
import { createServiceMethod } from './createServiceMethod';

type ApiNamespace = keyof Omit<typeof window.electronAPI, 'appVersion' | 'on'>;

export function createApiService<N extends ApiNamespace>(namespace: N): (typeof window.electronAPI)[N] {
  const logger = Logger.create(namespace);

  return new Proxy({} as (typeof window.electronAPI)[N], {
    get(_target, prop: string) {
      const ns = window.electronAPI[namespace] as Record<string, unknown>;
      const fn = ns[prop];
      if (typeof fn !== 'function') return fn;
      return createServiceMethod(logger, prop, fn.bind(ns) as (...args: unknown[]) => Promise<unknown>);
    },
  }) as (typeof window.electronAPI)[N];
}
