import type { FiringWindowViolationDto } from '@/shared/ipc/contracts';

export function formatFiringWindowViolationReminder(violation: FiringWindowViolationDto): string {
  return `Firing-window review — Lane ${violation.laneId.slice(0, 8)}, Rule ${violation.ruleReference}. ${violation.reviewGuidance} Detection only; no score or decision was changed.`;
}
