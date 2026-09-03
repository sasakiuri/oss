// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { RangeOfficerRequestService, SqliteRangeOfficerRequestRepository } from '@/main/modules/range-officer-request';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';

describe('RangeOfficerRequestService', () => {
  it('persists an append-only request and clearance across service reconstruction', () => {
    const database = createSqliteDb(':memory:');
    const repository = new SqliteRangeOfficerRequestRepository(database);
    const service = new RangeOfficerRequestService(repository);

    const active = service.request({ category: 'TARGET', message: 'Target display needs inspection' });
    expect(active).toMatchObject({ status: 'ACTIVE', category: 'TARGET' });
    expect(() => service.request({ category: 'ASSISTANCE' })).toThrow('already active');

    const cleared = service.clear({ requestId: active.requestId, clearedBy: 'Lane user' });
    expect(cleared).toMatchObject({ status: 'CLEARED', requestId: active.requestId });
    expect(new RangeOfficerRequestService(repository).getState()).toMatchObject({
      status: 'CLEARED',
      requestId: active.requestId,
    });
    expect(() => database.prepare('UPDATE range_officer_request_events SET category = ?').run('OTHER')).toThrow(
      'append-only',
    );
    database.close();
  });

  it('keeps SAFETY as an assistance category without owning a stop transition', () => {
    const database = createSqliteDb(':memory:');
    const service = new RangeOfficerRequestService(new SqliteRangeOfficerRequestRepository(database));

    expect(service.request({ category: 'SAFETY' })).toMatchObject({ status: 'ACTIVE', category: 'SAFETY' });
    database.close();
  });
});
