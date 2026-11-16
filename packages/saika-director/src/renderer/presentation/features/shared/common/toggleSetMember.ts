/** A copy of `current` that contains `value` exactly when `included` is true. */
export function toggleSetMember<T>(current: ReadonlySet<T>, value: T, included: boolean): Set<T> {
  const next = new Set(current);
  if (included) next.add(value);
  else next.delete(value);
  return next;
}
