// SPDX-License-Identifier: MIT
import type {
  ReserveLaneTransferAction,
  ReserveLaneTransferBundle,
  ReserveLaneTransferRequest,
} from '@sasakiuri/saika-protocol/ReserveLaneTransfer';

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
/** The Lane athlete assignment that a transfer reads and restores. */
export interface ITransferAssignmentPort {
  read(competitionId: string): { athlete: { id: string; name: string } | null } | null;
  restore(competitionId: string, json: string | null): Promise<void>;
}
export interface IReserveLaneTransferControl {
  assertMutationAllowed(): void;
  execute(competitionId: string, action: ReserveLaneTransferAction): Promise<ReserveLaneTransferBundle>;
}
