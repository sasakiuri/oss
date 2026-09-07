// SPDX-License-Identifier: MIT
import { canonicalJson } from '@sasakiuri/saika-rules';

import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import {
  ReserveLaneTransferBundleSchema,
  type ReserveLaneTransferAction,
  type ReserveLaneTransferBundle,
  type ReserveLaneTransferRequest,
} from '@/shared/mqtt/ReserveLaneTransfer';

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

/** A durable sequence of independently acknowledged operations, never a distributed transaction. */
export class ReserveLaneTransferService {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly repository: IReserveTransferRepository,
    private readonly transport: IReserveTransferTransport,
  ) {}
  workspace(competitionId: string) {
    return this.repository
      .list(competitionId)
      .map((request) => ({ request, entries: this.repository.entries(request.id), bundle: this.bundle(request.id) }));
  }
  prepare(request: ReserveLaneTransferRequest) {
    return this.serialize(async () => {
      if (
        request.sourceLaneId === request.destinationLaneId ||
        !request.officialName.trim() ||
        !request.statement.trim()
      )
        throw new Error('Distinct Lanes, official identity and a transfer reason are required');
      this.requireNotCancelled(request.id);
      const existing = this.repository.find(request.id);
      if (existing && canonicalJson(existing) !== canonicalJson(request))
        throw new Error('Transfer ID is bound to other instructions');
      const conflicting = this.repository
        .list(request.competitionId)
        .find(
          (other) =>
            other.id !== request.id &&
            [other.sourceLaneId, other.destinationLaneId].some(
              (laneId) => laneId === request.sourceLaneId || laneId === request.destinationLaneId,
            ) &&
            !this.repository
              .entries(other.id)
              .some((entry) => ['TARGET_ACTIVE', 'CANCELLED'].includes(entry.operation)),
        );
      if (conflicting) throw new Error(`Complete pending transfer ${conflicting.id} before reusing either Lane`);
      if (!existing) this.repository.create(request);
      const saved = this.bundle(request.id);
      if (saved) return saved;
      const bundle = await this.step(request.id, 'SOURCE_PREPARED', () =>
        this.transport.transfer({
          competitionId: request.competitionId,
          laneId: request.sourceLaneId,
          transfer: { operation: 'PREPARE_SOURCE', request },
        }),
      );
      return ReserveLaneTransferBundleSchema.parse(bundle);
    });
  }
  complete(input: { id: string; expectedDigest: string; confirmed: true }) {
    return this.serialize(async () => {
      const bundle = this.requireBundle(input.id);
      if (input.confirmed !== true || bundle.digest !== input.expectedDigest)
        throw new Error('Confirm the prepared snapshot before transfer');
      const request = bundle.request;
      const send = (laneId: string, transfer: ReserveLaneTransferAction) =>
        this.transport.transfer({ competitionId: request.competitionId, laneId, transfer });
      await this.step(request.id, 'TARGET_STAGED', () =>
        send(request.destinationLaneId, { operation: 'STAGE_TARGET', bundle }),
      );
      await this.step(request.id, 'SOURCE_RETIRED', () =>
        send(request.sourceLaneId, { operation: 'RETIRE_SOURCE', id: request.id, digest: bundle.digest }),
      );
      await this.step(request.id, 'TARGET_ACTIVE', () =>
        send(request.destinationLaneId, {
          operation: 'ACTIVATE_TARGET',
          id: request.id,
          digest: bundle.digest,
          sourceRetired: true,
        }),
      );
      return bundle;
    });
  }
  resume(grant: ReserveTransferGrant) {
    return this.serialize(async () => {
      const bundle = this.requireBundle(grant.transferId);
      this.requireCompleted(bundle.request.id);
      if (
        !grant.officialName.trim() ||
        !grant.statement.trim() ||
        !Number.isInteger(grant.remainingSeconds) ||
        grant.remainingSeconds <= 0
      )
        throw new Error('Record a valid official resume grant');
      const saved = this.repository.entries(grant.transferId).find((entry) => entry.operation === 'RESUME_AUTHORIZED');
      if (saved && canonicalJson(saved.detail) !== canonicalJson(grant))
        throw new Error('Retry the recorded resume grant without changing it');
      if (!saved) this.append(grant.transferId, 'RESUME_AUTHORIZED', grant);
      await this.step(grant.transferId, 'RESUMED', () =>
        this.transport.resume({
          competitionId: bundle.request.competitionId,
          laneId: bundle.request.destinationLaneId,
          transferId: grant.transferId,
          grant,
        }),
      );
    });
  }
  resumeMatch(id: string) {
    return this.serialize(async () => {
      const bundle = this.requireBundle(id);
      if (!this.repository.entries(id).some((entry) => entry.operation === 'RESUMED'))
        throw new Error('Apply the saved resume grant first');
      await this.step(id, 'MATCH_RESUMED', () =>
        this.transport.resumeMatch({
          competitionId: bundle.request.competitionId,
          laneId: bundle.request.destinationLaneId,
          transferId: id,
        }),
      );
    });
  }
  cancel(input: { id: string; officialName: string; statement: string }) {
    return this.serialize(async () => {
      if (!this.repository.find(input.id) || !input.officialName.trim() || !input.statement.trim())
        throw new Error('An existing transfer, official and reason are required');
      const entries = this.repository.entries(input.id);
      if (entries.some((entry) => entry.operation === 'SOURCE_RETIRED'))
        throw new Error('Source retirement already completed; complete or retry this transfer');
      const bundle = this.bundle(input.id);
      if (bundle) {
        await this.step(input.id, 'SOURCE_CANCELLED', () =>
          this.transport.transfer({
            competitionId: bundle.request.competitionId,
            laneId: bundle.request.sourceLaneId,
            transfer: { operation: 'CANCEL_SOURCE', id: input.id, digest: bundle.digest },
          }),
        );
        const targetContacted = entries.some(
          (entry) =>
            entry.operation === 'TARGET_STAGED' ||
            (entry.operation === 'ATTEMPTED' &&
              (entry.detail as { operation?: string })?.operation === 'TARGET_STAGED'),
        );
        if (targetContacted)
          await this.step(input.id, 'TARGET_CANCELLED', () =>
            this.transport.transfer({
              competitionId: bundle.request.competitionId,
              laneId: bundle.request.destinationLaneId,
              transfer: { operation: 'CANCEL_TARGET', bundle },
            }),
          );
      }
      if (!entries.some((entry) => entry.operation === 'CANCELLED')) this.append(input.id, 'CANCELLED', input);
    });
  }
  private bundle(id: string): ReserveLaneTransferBundle | null {
    const entry = this.repository.entries(id).find((candidate) => candidate.operation === 'SOURCE_PREPARED');
    return entry ? ReserveLaneTransferBundleSchema.parse(entry.detail) : null;
  }
  private requireNotCancelled(id: string) {
    if (this.repository.entries(id).some((entry) => ['CANCELLED', 'SOURCE_CANCELLED'].includes(entry.operation)))
      throw new Error('This transfer was cancelled; prepare a new transfer');
  }
  private requireBundle(id: string) {
    this.requireNotCancelled(id);
    const bundle = this.bundle(id);
    if (!bundle) throw new Error('Prepare the source snapshot first');
    return bundle;
  }
  private requireCompleted(id: string) {
    if (!this.repository.entries(id).some((entry) => entry.operation === 'TARGET_ACTIVE'))
      throw new Error('Complete the state transfer before resume');
  }
  private append(id: string, operation: string, detail: unknown) {
    this.repository.append({
      id: crypto.randomUUID(),
      transferId: id,
      operation,
      detail: detail ?? null,
      recordedAt: new Date().toISOString(),
    });
  }
  private async step<T>(id: string, operation: string, action: () => Promise<T>): Promise<T> {
    const saved = this.repository.entries(id).find((entry) => entry.operation === operation);
    if (saved) return saved.detail as T;
    this.append(id, 'ATTEMPTED', { operation });
    try {
      const result = await action();
      this.append(id, operation, result);
      return result;
    } catch (error) {
      this.append(id, 'FAILED', { operation, reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
