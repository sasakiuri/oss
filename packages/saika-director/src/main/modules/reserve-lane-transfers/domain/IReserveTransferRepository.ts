// SPDX-License-Identifier: MIT
import type { ReserveLaneTransferRequest } from '@sasakiuri/saika-protocol/ReserveLaneTransfer';

export interface ReserveTransferEntry {
  id: string;
  transferId: string;
  operation: string;
  recordedAt: string;
  detail: unknown;
}
export interface IReserveTransferRepository {
  create(request: ReserveLaneTransferRequest): void;
  find(id: string): ReserveLaneTransferRequest | null;
  list(competitionId: string): readonly ReserveLaneTransferRequest[];
  entries(id: string): readonly ReserveTransferEntry[];
  append(entry: ReserveTransferEntry): void;
}
