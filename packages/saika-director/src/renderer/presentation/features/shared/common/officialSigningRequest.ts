import type { OfficialSigningMethod } from '@/shared/ipc/contracts';

/**
 * The signing fields of a sign-off request. An external signature carries its evidence reference and, when entered,
 * the recording operator; a personal signature carries only the method.
 */
export function officialSigningRequest(method: OfficialSigningMethod, recordedBy: string, evidenceReference: string) {
  return {
    method,
    ...(method === 'EXTERNAL'
      ? {
          ...(recordedBy.trim() ? { recordedBy: recordedBy.trim() } : {}),
          evidenceReference: evidenceReference.trim(),
        }
      : {}),
  };
}
