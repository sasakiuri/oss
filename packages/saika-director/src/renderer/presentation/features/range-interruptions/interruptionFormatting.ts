// SPDX-License-Identifier: MIT
import type { RangeInterruptionCaseDto } from '@/shared/ipc/contracts';

export function statusClass(status: RangeInterruptionCaseDto['status']): string {
  if (status === 'VOID') return 'text-vscode-error';
  if (status === 'CLOSED') return 'text-vscode-success';
  return 'text-vscode-warning';
}

export function formatEnum(value: string): string {
  return value.replaceAll('_', ' ').toLowerCase();
}

export function formatDuration(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

export function shortLane(laneId: string): string {
  return laneId.length > 12 ? laneId.slice(0, 8) : laneId;
}

export function toLocalInputValue(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}
