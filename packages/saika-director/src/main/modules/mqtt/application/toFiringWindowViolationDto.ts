import type { FiringWindowViolation } from '../domain/IFiringWindowJournal';
import type { FiringWindowViolationDto } from '@/shared/ipc/contracts';

export function toFiringWindowViolationDto(violation: FiringWindowViolation): FiringWindowViolationDto {
  return {
    ...violation,
    evaluatedShotAt: violation.evaluatedShotAt.toISOString(),
    firedAt: violation.firedAt.toISOString(),
    receivedAt: violation.receivedAt.toISOString(),
    observedAt: violation.observedAt.toISOString(),
    detectedAt: violation.detectedAt.toISOString(),
  };
}
