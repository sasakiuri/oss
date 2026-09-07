// SPDX-License-Identifier: MIT
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { migration070ReserveLaneTransfers } from '@/main/infrastructure/database/migrations/070_reserve_lane_transfers';
import {
  ReserveLaneTransferService,
  type IReserveTransferTransport,
} from '@/main/modules/reserve-lane-transfers/ReserveLaneTransferService';
import { ReserveTransferDataGuard } from '@/main/modules/reserve-lane-transfers/ReserveTransferDataGuard';
import { SqliteReserveTransferRepository } from '@/main/modules/reserve-lane-transfers/SqliteReserveTransferRepository';
import type { ReserveLaneTransferBundle, ReserveLaneTransferRequest } from '@/shared/mqtt/ReserveLaneTransfer';

const request: ReserveLaneTransferRequest = {
  id: '11111111-1111-4111-8111-111111111111',
  competitionId: '22222222-2222-4222-8222-222222222222',
  sourceLaneId: '33333333-3333-4333-8333-333333333333',
  destinationLaneId: '44444444-4444-4444-8444-444444444444',
  officialName: 'Jury',
  statement: 'IR 12',
};
const bundle: ReserveLaneTransferBundle = {
  version: 1,
  request,
  sourceSafetyStopId: '55555555-5555-4555-8555-555555555555',
  capturedAt: '2026-09-07T00:00:00Z',
  summary: {
    athleteId: 'athlete',
    athleteName: 'Alex',
    matchShots: 1,
    totalScoreX10: 100,
    remainingSeconds: 240,
    rulePackFingerprint: 'a'.repeat(64),
  },
  competitionJson: '{}',
  sessionJson: '{}',
  assignmentJson: '{}',
  digest: 'b'.repeat(64),
};
const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
function fixture() {
  const db = new Database(':memory:');
  databases.push(db);
  migration070ReserveLaneTransfers.up(db);
  const repository = new SqliteReserveTransferRepository(db);
  const transport: IReserveTransferTransport = {
    transfer: vi.fn(async () => bundle),
    resume: vi.fn(async () => undefined),
    resumeMatch: vi.fn(async () => undefined),
  };
  return {
    db,
    repository,
    transport,
    service: new ReserveLaneTransferService(repository, transport),
    guard: new ReserveTransferDataGuard(repository),
  };
}
describe('ReserveLaneTransferService', () => {
  it('retries only unfinished steps after an uncertain retirement ACK, keeps data on hold and resumes by a separate grant', async () => {
    const f = fixture();
    const context = { competitionId: request.competitionId, operation: 'CLEAR_COMPETITION_DATA' as const };
    await f.service.prepare(request);
    expect(() => f.guard.assertAllowed(context)).toThrow(/pending reserve transfer/);
    let retirementAttempts = 0;
    vi.mocked(f.transport.transfer).mockImplementation(async ({ transfer }) => {
      if (transfer.operation === 'CANCEL_SOURCE' && retirementAttempts > 0)
        throw new Error('Source retirement already completed');
      if (transfer.operation === 'RETIRE_SOURCE' && retirementAttempts++ === 0) throw new Error('ACK lost');
      return bundle;
    });
    const input = { id: request.id, expectedDigest: bundle.digest, confirmed: true as const };
    await expect(f.service.complete(input)).rejects.toThrow('ACK lost');
    expect(f.repository.entries(request.id).some((entry) => entry.operation === 'TARGET_ACTIVE')).toBe(false);
    await expect(f.service.cancel({ id: request.id, officialName: 'Jury', statement: 'Cancel' })).rejects.toThrow(
      /retirement/,
    );
    await new ReserveLaneTransferService(f.repository, f.transport).complete(input);
    const operations = vi.mocked(f.transport.transfer).mock.calls.map(([argument]) => argument.transfer.operation);
    expect(operations).toEqual([
      'PREPARE_SOURCE',
      'STAGE_TARGET',
      'RETIRE_SOURCE',
      'CANCEL_SOURCE',
      'RETIRE_SOURCE',
      'ACTIVATE_TARGET',
    ]);
    expect(() => f.guard.assertAllowed(context)).not.toThrow();
    expect(f.transport.resume).not.toHaveBeenCalled();
    const grant = {
      id: crypto.randomUUID(),
      transferId: request.id,
      remainingSeconds: 540,
      unlimitedSightingShots: true,
      officialName: 'Jury',
      statement: '6.10.9: remaining time plus 5 minutes',
    };
    vi.mocked(f.transport.resume).mockRejectedValueOnce(new Error('STOP not cleared'));
    await expect(f.service.resume(grant)).rejects.toThrow('STOP not cleared');
    await expect(f.service.resume({ ...grant, remainingSeconds: 600 })).rejects.toThrow(/without changing/);
    await f.service.resume(grant);
    await f.service.resumeMatch(request.id);
    await f.service.resumeMatch(request.id);
    expect(f.transport.resumeMatch).toHaveBeenCalledOnce();
    expect(() => f.db.exec('DELETE FROM reserve_lane_transfer_events')).toThrow(/append-only/);
  });

  it('requires snapshot confirmation and permits cancellation before source retirement is attempted', async () => {
    const f = fixture();
    await f.service.prepare(request);
    await expect(
      f.service.complete({ id: request.id, expectedDigest: 'c'.repeat(64), confirmed: true }),
    ).rejects.toThrow(/Confirm/);
    await f.service.cancel({ id: request.id, officialName: 'Jury', statement: 'Keep original Lane' });
    await expect(
      f.service.complete({ id: request.id, expectedDigest: bundle.digest, confirmed: true }),
    ).rejects.toThrow(/cancelled/);
    expect(vi.mocked(f.transport.transfer).mock.calls.map(([input]) => input.transfer.operation)).toEqual([
      'PREPARE_SOURCE',
      'CANCEL_SOURCE',
    ]);
    expect(() =>
      f.guard.assertAllowed({ competitionId: request.competitionId, operation: 'CLEAR_COMPETITION_DATA' }),
    ).not.toThrow();
  });
});
