// SPDX-License-Identifier: MIT
import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import type {
  ReserveLaneTransferAction,
  ReserveLaneTransferBundle,
} from '@sasakiuri/saika-protocol/ReserveLaneTransfer';

export interface ReserveTransferGrant {
  id: string;
  transferId: string;
  remainingSeconds: number;
  unlimitedSightingShots: boolean;
  officialName: string;
  statement: string;
}
export const TransferReserveLaneToken = defineCommand<
  { competitionId: string; laneId: string; transfer: ReserveLaneTransferAction },
  ReserveLaneTransferBundle
>('TransferReserveLaneTransport');
export const ResumeReserveLaneToken = defineCommand<
  { competitionId: string; laneId: string; transferId: string; grant: ReserveTransferGrant },
  void
>('ResumeReserveLaneTransport');
export const ResumeReserveMatchToken = defineCommand<
  { competitionId: string; laneId: string; transferId: string },
  void
>('ResumeReserveMatchTransport');
export interface IReserveTransferTransport {
  transfer(input: {
    competitionId: string;
    laneId: string;
    transfer: ReserveLaneTransferAction;
  }): Promise<ReserveLaneTransferBundle>;
  resume(input: {
    competitionId: string;
    laneId: string;
    transferId: string;
    grant: ReserveTransferGrant;
  }): Promise<void>;
  resumeMatch(input: { competitionId: string; laneId: string; transferId: string }): Promise<void>;
}
