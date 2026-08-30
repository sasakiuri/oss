import { describe, expect, it } from 'vitest';
import { MixedTeamTimeoutService } from '@/main/modules/mixed-team-timeouts';
import type {
  IMixedTeamTimeoutRepository,
  MixedTeamTimeoutEntryRecord,
  MixedTeamTimeoutRecord,
} from '@/main/modules/mixed-team-timeouts';

class MemoryRepository implements IMixedTeamTimeoutRepository {
  sessions: MixedTeamTimeoutRecord[] = [];
  appendSession(session: Omit<MixedTeamTimeoutRecord, 'entries'>): void {
    this.sessions.push({ ...session, entries: [] });
  }
  appendEntry(value: MixedTeamTimeoutEntryRecord): void {
    const session = this.sessions.find((candidate) => candidate.id === value.timeoutId)!;
    session.entries.push(value);
  }
  findByCompetition(competitionId: string): MixedTeamTimeoutRecord[] {
    return this.sessions.filter((session) => session.competitionId === competitionId);
  }
  findById(id: string): MixedTeamTimeoutRecord | null {
    return this.sessions.find((session) => session.id === id) ?? null;
  }
}

const competitionId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-01T00:00:00.000Z');

describe('MixedTeamTimeoutService', () => {
  it('limits the requesting team to one 30-second timeout but preserves courtesy teams rights', async () => {
    const repository = new MemoryRepository();
    const service = new MixedTeamTimeoutService(repository, () => now);
    const first = await service.start({
      competitionId,
      requestingTeamId: 'USA-A',
      courtesyTeamIds: ['JPN-A'],
      requestedByRole: 'COACH',
      requestedByName: 'Coach USA',
      afterShot: 15,
      officialName: 'Jury',
      statement: 'Started',
    });
    expect(Date.parse(first.expiresAt) - Date.parse(first.startedAt)).toBe(30_000);
    await service.close({ timeoutId: first.id, officialName: 'Jury', statement: 'Time' });
    await expect(
      service.start({
        competitionId,
        requestingTeamId: 'USA-A',
        courtesyTeamIds: [],
        requestedByRole: 'ATHLETE',
        requestedByName: 'Athlete USA',
        afterShot: 16,
        officialName: 'Jury',
        statement: 'Again',
      }),
    ).rejects.toThrow('already used');
    await expect(
      service.start({
        competitionId,
        requestingTeamId: 'JPN-A',
        courtesyTeamIds: [],
        requestedByRole: 'COACH',
        requestedByName: 'Coach JPN',
        afterShot: 16,
        officialName: 'Jury',
        statement: 'Own request',
      }),
    ).resolves.toMatchObject({ requestingTeamId: 'JPN-A', durationSeconds: 30 });
  });

  it('rejects requests that are not at a completed round boundary', async () => {
    const service = new MixedTeamTimeoutService(new MemoryRepository(), () => now);
    await expect(
      service.start({
        competitionId,
        requestingTeamId: 'USA-A',
        courtesyTeamIds: [],
        requestedByRole: 'COACH',
        requestedByName: 'Coach',
        afterShot: 12,
        officialName: 'Jury',
        statement: 'Invalid',
      }),
    ).rejects.toThrow('completed Final round');
  });
});
