import type { CaseScopePayload } from '@/shared/ipc/contracts';

/** The scopes in order, without repeating a competition or event. */
export function uniqueCaseScopes(scopes: readonly CaseScopePayload[]): CaseScopePayload[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The candidate scopes that a case is not linked to yet. */
export function unlinkedCaseScopes(
  linked: readonly CaseScopePayload[],
  candidates: readonly CaseScopePayload[],
): CaseScopePayload[] {
  return candidates.filter(
    (candidate) =>
      !linked.some((scope) => scope.scopeType === candidate.scopeType && scope.scopeId === candidate.scopeId),
  );
}
