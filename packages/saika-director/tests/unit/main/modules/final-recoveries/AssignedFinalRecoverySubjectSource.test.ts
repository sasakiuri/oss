import { describe, expect, it, vi } from 'vitest';
import type { IParticipantRepository } from '@/main/modules/championship';
import type { ILaneControlRepository } from '@/main/modules/lane-control';
import { AssignedFinalRecoverySubjectSource } from '@/main/modules/final-recoveries/infra/AssignedFinalRecoverySubjectSource';

describe('Assigned Final recovery subject snapshots', () => {
  const participant = {
    eventId: { value: 'event' },
    playerName: 'Finalist',
    officialEntry: { teamId: 'team-1', teamName: 'Team One' },
  };
  function source() {
    return new AssignedFinalRecoverySubjectSource(
      { findById: vi.fn(() => participant) } as unknown as IParticipantRepository,
      { findById: vi.fn(() => ({ player: { participantId: 'athlete-1' } })) } as unknown as ILaneControlRepository,
    );
  }
  it('keeps the same athlete after a reserve-Lane move and requires the selected event to match', () => {
    const resolve = source();
    const input = { eventId: 'event', procedureProfile: 'RIFLE_PISTOL_10M_50M' as const, affectedLaneIds: ['lane-1'] };
    expect(resolve.resolve(input)).toEqual({ kind: 'ATHLETE', key: 'athlete-1', description: 'Finalist' });
    expect(resolve.resolve({ ...input, affectedLaneIds: ['reserve'] })).toEqual(resolve.resolve(input));
    expect(resolve.resolve({ ...input, eventId: 'other-event' })).toBeNull();
  });
  it('uses event-scoped team identity for partners and leaves unassigned operation to official references', () => {
    const resolve = source();
    expect(
      resolve.resolve({ procedureProfile: 'RIFLE_PISTOL_10M_50M_MIXED_TEAM', affectedLaneIds: ['lane-1'] }),
    ).toEqual({ kind: 'TEAM', key: 'event:team-1', description: 'Team One' });
    expect(resolve.resolve({ procedureProfile: 'GENERAL', affectedLaneIds: [] })).toBeNull();
  });
});
