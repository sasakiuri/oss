// SPDX-License-Identifier: MIT
import { ShotRoutingService, type ShotRoutingDeps } from '@/main/modules/connection/application/ShotRoutingService';
import type { ShotData } from '@/main/modules/connection/domain/ShotData';
import { SerialQueue } from '@/main/shared-infra/operations/SerialQueue';

/** Feeds shots decoded from the target port to shot routing in receipt order. */
export function createShotIngestionHandler(deps: ShotRoutingDeps): (shotData: ShotData) => Promise<void> {
  const routing = new ShotRoutingService(deps);
  // A protocol session can emit multiple complete frames from one serial chunk.
  // Keep repository read-modify-write operations in receipt order so concurrent
  // callbacks cannot reconstruct the same session state and reuse a shot number.
  const receipts = new SerialQueue();
  return (shotData) => receipts.run(() => routing.route(shotData));
}
