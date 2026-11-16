import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * The entry type chosen in a case form, kept among the types the case currently allows.
 *
 * It starts at the first allowed type. When the allowed types no longer include the chosen one (for example after an
 * entry changed the case status), it resets to the first allowed type, or to `fallback` when none is allowed.
 */
export function useEntryTypeSelection<T extends string>(
  options: readonly T[],
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [entryType, setEntryType] = useState<T>(options[0] ?? fallback);

  useEffect(() => {
    if (!options.includes(entryType)) setEntryType(options[0] ?? fallback);
  }, [entryType, fallback, options]);

  return [entryType, setEntryType];
}
