// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { eventsContract, mqttContract } from '@/shared/ipc/contracts';
import { DirectorMembershipDtoSchema } from '@/shared/ipc/contracts/mqtt.contract';

describe('Director membership contract', () => {
  it.each([null, 'competition-1'])('accepts membership %s in the query and event', (competitionId) => {
    const membership = { competitionId, revision: 1 };
    expect(mqttContract.channels.getDirectorMembership).toBe('mqtt:getDirectorMembership');
    expect(
      mqttContract.procedures.getDirectorMembership.output.safeParse({ success: true, data: membership }).success,
    ).toBe(true);
    expect(eventsContract.events.directorMembershipChanged.schema.parse(membership)).toEqual(membership);
  });

  it.each([
    { competitionId: '', revision: 0 },
    { competitionId: null, revision: -1 },
    { competitionId: null, revision: 0.5 },
    { revision: 0 },
  ])('rejects invalid membership %j', (membership) => {
    expect(DirectorMembershipDtoSchema.safeParse(membership).success).toBe(false);
  });
});
