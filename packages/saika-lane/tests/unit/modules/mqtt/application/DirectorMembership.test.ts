// SPDX-License-Identifier: MIT
import { describe, expect, it, vi } from 'vitest';

import { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';

import { createMockStorage } from '../../../../helpers/mockDependencies';

it('reads persisted membership before transport startup', () => {
  const storage = createMockStorage();
  storage.set('mqtt.competitionId', 'competition-1');
  const membership = new DirectorMembership(storage, new TypedEventBus());
  expect(membership.snapshot).toEqual({ competitionId: 'competition-1', revision: 0 });
});

describe('durable membership changes', () => {
  it.each(['join', 'leave'])('does not emit or revise if %s persistence fails', (operation) => {
    const storage = createMockStorage();
    const eventBus = new TypedEventBus();
    const changed = vi.fn();
    eventBus.on('DirectorMembershipChanged', changed);
    const membership = new DirectorMembership(storage, eventBus);
    if (operation === 'leave') storage.set('mqtt.competitionId', 'competition-1');
    const failingWrite = operation === 'join' ? vi.mocked(storage.set) : vi.mocked(storage.delete);
    failingWrite.mockImplementationOnce(() => {
      throw new Error('storage failed');
    });
    expect(() => membership.setCompetitionId(operation === 'join' ? 'competition-1' : null)).toThrow('storage failed');
    expect(membership.snapshot).toEqual({ competitionId: operation === 'join' ? null : 'competition-1', revision: 0 });
    expect(changed).not.toHaveBeenCalled();
  });
});
