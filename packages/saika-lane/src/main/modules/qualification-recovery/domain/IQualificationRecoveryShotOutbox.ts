// SPDX-License-Identifier: MIT
import type { QualificationRecoveryShotPayload } from '@/shared/mqtt/QualificationRecovery';

export interface IQualificationRecoveryShotOutbox {
  enqueue(payload: QualificationRecoveryShotPayload): void;
  hasShot(shotId: string): boolean;
  findPending(limit?: number): QualificationRecoveryShotPayload[];
  markPublished(shotId: string, publishedAt: Date): void;
}
