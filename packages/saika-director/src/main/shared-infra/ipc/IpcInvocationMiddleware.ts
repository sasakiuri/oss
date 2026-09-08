export interface IpcInvocation {
  readonly namespace: string;
  readonly operation: string;
  readonly kind: 'query' | 'command';
  readonly senderId: number;
}

/** Optional transport boundary; business handlers do not depend on a particular identity provider. */
export interface IpcInvocationMiddleware {
  invoke<T>(invocation: IpcInvocation, next: () => Promise<T>): Promise<T>;
}
