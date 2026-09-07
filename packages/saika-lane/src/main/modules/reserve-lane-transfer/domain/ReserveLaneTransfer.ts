// SPDX-License-Identifier: MIT
import type {
  ReserveLaneTransferAction,
  ReserveLaneTransferBundle,
  ReserveLaneTransferRequest,
} from '@/shared/mqtt/ReserveLaneTransfer';

export interface ReserveLaneTransferEntry {
  readonly id: string;
  readonly transferId: string;
  readonly phase:
    | 'SOURCE_PREPARED'
    | 'TARGET_STAGED'
    | 'SOURCE_RETIRING'
    | 'SOURCE_RETIRED'
    | 'TARGET_ACTIVATING'
    | 'TARGET_ACTIVE'
    | 'CANCELLED';
  readonly bundle: ReserveLaneTransferBundle;
  readonly recordedAt: string;
}
export interface IReserveLaneTransferJournal {
  pending(): boolean;
  list(transferId: string): readonly ReserveLaneTransferEntry[];
  append(entry: ReserveLaneTransferEntry): void;
}
/** State ownership is independent from transport, adjudication and the resume grant. */
export interface IReserveLaneTransferStatePort {
  assertSourceCancellable(bundle: ReserveLaneTransferBundle): Promise<void>;
  capture(request: ReserveLaneTransferRequest): Promise<Omit<ReserveLaneTransferBundle, 'digest'>>;
  checkTarget(bundle: ReserveLaneTransferBundle, retry: boolean): Promise<void>;
  retireSource(bundle: ReserveLaneTransferBundle, retry: boolean): Promise<void>;
  activateTarget(bundle: ReserveLaneTransferBundle, retry: boolean): Promise<void>;
}
export interface IReserveLaneTransferControl {
  assertMutationAllowed(): void;
  execute(competitionId: string, action: ReserveLaneTransferAction): Promise<ReserveLaneTransferBundle>;
}
