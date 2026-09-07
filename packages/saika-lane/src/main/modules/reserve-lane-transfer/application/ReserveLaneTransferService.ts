// SPDX-License-Identifier: MIT
import { createHash } from 'node:crypto';

import { canonicalJson } from '@sasakiuri/saika-rules';

import {
  ReserveLaneTransferBundleSchema,
  type ReserveLaneTransferAction,
  type ReserveLaneTransferBundle,
} from '@/shared/mqtt/ReserveLaneTransfer';

import type {
  IReserveLaneTransferControl,
  IReserveLaneTransferJournal,
  IReserveLaneTransferStatePort,
  ReserveLaneTransferEntry,
} from '../domain/ReserveLaneTransfer';

export function reserveTransferDigest(bundle: Omit<ReserveLaneTransferBundle, 'digest'>): string {
  return createHash('sha256').update(canonicalJson(bundle)).digest('hex');
}

export class ReserveLaneTransferService implements IReserveLaneTransferControl {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly journal: IReserveLaneTransferJournal,
    private readonly state: IReserveLaneTransferStatePort,
    private readonly laneId: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  assertMutationAllowed(): void {
    if (this.journal.pending())
      throw new Error('Complete or cancel the pending reserve transfer before changing Lane state');
  }
  execute(competitionId: string, action: ReserveLaneTransferAction): Promise<ReserveLaneTransferBundle> {
    const result = this.tail.then(() => this.executeNow(competitionId, action));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async executeNow(
    competitionId: string,
    action: ReserveLaneTransferAction,
  ): Promise<ReserveLaneTransferBundle> {
    const id =
      action.operation === 'PREPARE_SOURCE'
        ? action.request.id
        : 'bundle' in action
          ? action.bundle.request.id
          : action.id;
    const history = this.journal.list(id);
    let bundle = history[0]?.bundle;
    const requestCompetitionId =
      action.operation === 'PREPARE_SOURCE'
        ? action.request.competitionId
        : 'bundle' in action
          ? action.bundle.request.competitionId
          : bundle?.request.competitionId;
    if (requestCompetitionId !== competitionId) throw new Error('Transfer does not belong to this competition');
    if (history.some((entry) => entry.phase === 'CANCELLED')) {
      if (action.operation === 'CANCEL_SOURCE' || action.operation === 'CANCEL_TARGET') return bundle!;
      throw new Error('Transfer was cancelled');
    }
    if (action.operation === 'CANCEL_TARGET') {
      if (history.some((entry) => entry.phase === 'TARGET_ACTIVATING' || entry.phase === 'TARGET_ACTIVE'))
        throw new Error('Target activation has already started');
      const { digest, ...content } = action.bundle;
      if (
        action.bundle.request.destinationLaneId !== this.laneId() ||
        digest !== reserveTransferDigest(content) ||
        (bundle && bundle.digest !== digest)
      )
        throw new Error('Cancellation is bound to another destination or snapshot');
      this.append('CANCELLED', action.bundle);
      return action.bundle;
    }
    if (action.operation === 'CANCEL_SOURCE') {
      if (!bundle || bundle.digest !== action.digest || bundle.request.sourceLaneId !== this.laneId())
        throw new Error('Source snapshot not found');
      if (history.some((entry) => entry.phase === 'SOURCE_RETIRED'))
        throw new Error('Source retirement has already completed');
      await this.state.assertSourceCancellable(bundle);
      this.append('CANCELLED', bundle);
      return bundle;
    }

    if (action.operation === 'PREPARE_SOURCE') {
      if (
        action.request.sourceLaneId !== this.laneId() ||
        action.request.sourceLaneId === action.request.destinationLaneId
      )
        throw new Error('Invalid source or destination Lane');
      if (bundle) {
        if (canonicalJson(bundle.request) !== canonicalJson(action.request))
          throw new Error('Transfer ID is bound to different instructions');
        return bundle;
      }
      this.assertMutationAllowed();
      const content = await this.state.capture(action.request);
      bundle = ReserveLaneTransferBundleSchema.parse({ ...content, digest: reserveTransferDigest(content) });
      this.append('SOURCE_PREPARED', bundle);
      return bundle;
    }
    if (action.operation === 'STAGE_TARGET') {
      const { digest, ...content } = action.bundle;
      if (digest !== reserveTransferDigest(content)) throw new Error('Transfer snapshot digest does not match');
      if (action.bundle.request.destinationLaneId !== this.laneId())
        throw new Error('Snapshot is bound to another destination Lane');
      if (bundle) {
        if (bundle.digest !== digest) throw new Error('Transfer ID is bound to another snapshot');
        return bundle;
      }
      this.assertMutationAllowed();
      await this.state.checkTarget(action.bundle, false);
      this.append('TARGET_STAGED', action.bundle);
      return action.bundle;
    }
    if (!bundle || bundle.digest !== action.digest) throw new Error('Prepared transfer snapshot not found');
    if (action.operation === 'RETIRE_SOURCE') {
      if (bundle.request.sourceLaneId !== this.laneId()) throw new Error('This Lane is not the transfer source');
      if (history.some((entry) => entry.phase === 'SOURCE_RETIRED')) return bundle;
      const retry = history.some((entry) => entry.phase === 'SOURCE_RETIRING');
      if (!retry) this.append('SOURCE_RETIRING', bundle);
      await this.state.retireSource(bundle, retry);
      this.append('SOURCE_RETIRED', bundle);
    } else {
      if (action.sourceRetired !== true || bundle.request.destinationLaneId !== this.laneId())
        throw new Error('Source retirement confirmation is required for this destination');
      if (history.some((entry) => entry.phase === 'TARGET_ACTIVE')) return bundle;
      const retry = history.some((entry) => entry.phase === 'TARGET_ACTIVATING');
      if (!retry) this.append('TARGET_ACTIVATING', bundle);
      await this.state.checkTarget(bundle, retry);
      await this.state.activateTarget(bundle, retry);
      this.append('TARGET_ACTIVE', bundle);
    }
    return bundle;
  }
  private append(phase: ReserveLaneTransferEntry['phase'], bundle: ReserveLaneTransferBundle) {
    this.journal.append({
      id: crypto.randomUUID(),
      transferId: bundle.request.id,
      phase,
      bundle,
      recordedAt: this.now().toISOString(),
    });
  }
}
