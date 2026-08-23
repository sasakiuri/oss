// SPDX-License-Identifier: MIT
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  initializeLogger: vi.fn(),
  resetLogger: vi.fn(),
}));

import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import {
  createShotIngestionHandler,
  type ShotIngestionDeps,
} from '@/main/modules/connection/infra/ShotIngestionHandler';
import type { ShotData } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';

import { buildSession } from '../../../../helpers/factories';
import {
  createMockCommandBus,
  createMockCompetitionRepository,
  createMockSessionRepository,
} from '../../../../helpers/mockDependencies';

describe('ShotIngestionHandler', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let competitionRepository: ReturnType<typeof createMockCompetitionRepository>;
  let deps: ShotIngestionDeps;
  let shotData: ShotData;

  beforeEach(() => {
    commandBus = createMockCommandBus();
    sessionRepository = createMockSessionRepository();
    competitionRepository = createMockCompetitionRepository();
    deps = { commandBus, sessionRepository, competitionRepository };

    shotData = {
      x: 1.5,
      y: -2.3,
      timestamp: new Date('2026-01-15T10:00:00Z'),
      score: 9.8,
    };
  });

  it('should return a function', () => {
    const handler = createShotIngestionHandler(deps);
    expect(typeof handler).toBe('function');
  });

  it('should skip recording when no active session exists', async () => {
    sessionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should execute RecordShot command when active session exists', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        sessionId: session.id,
        deviceScore: 9.8,
      }),
    );
  });

  it('should serialize concurrently received shots in arrival order', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    let releaseFirstExecution!: () => void;
    const firstExecution = new Promise<void>((resolve) => {
      releaseFirstExecution = resolve;
    });
    (commandBus.execute as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => firstExecution)
      .mockResolvedValueOnce(undefined);

    const firstShot = { ...shotData, timestamp: new Date('2026-01-15T10:00:00Z') };
    const secondShot = { ...shotData, timestamp: new Date('2026-01-15T10:00:01Z') };
    const handler = createShotIngestionHandler(deps);

    const firstResult = handler(firstShot);
    const secondResult = handler(secondShot);

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commandBus.execute).toHaveBeenCalledTimes(1);

    releaseFirstExecution();
    await Promise.all([firstResult, secondResult]);

    expect(commandBus.execute).toHaveBeenCalledTimes(2);
    expect((commandBus.execute as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1].timestamp)).toEqual([
      firstShot.timestamp,
      secondShot.timestamp,
    ]);
  });

  it('should use the active competition session instead of an older active session', async () => {
    const staleSession = buildSession();
    const competitionSession = buildSession();
    const activeCompetition = CompetitionState.create(
      'competition-001',
      competitionSession.id,
      BR60S.config,
    ).startStage();
    sessionRepository.findActive = vi.fn().mockResolvedValue(staleSession);
    sessionRepository.findById = vi.fn().mockResolvedValue(competitionSession);
    competitionRepository.findActive = vi.fn().mockResolvedValue(activeCompetition);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(sessionRepository.findById).toHaveBeenCalledWith(competitionSession.id);
    expect(sessionRepository.findActive).not.toHaveBeenCalled();
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RecordShot' }),
      expect.objectContaining({
        sessionId: competitionSession.id,
      }),
    );
  });

  it('should pass ImpactPoint with correct coordinates', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: { x: number; y: number } };
    expect(input.impactPoint.x).toBe(1.5);
    expect(input.impactPoint.y).toBe(-2.3);
  });

  it('should pass timestamp from shot data', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { timestamp: Date };
    expect(input.timestamp).toEqual(new Date('2026-01-15T10:00:00Z'));
  });

  it('should reject shot when competition guard rejects', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue({
      phase: 'SERIES_COMPLETE',
      canAcceptShot: () => false,
    });

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('should accept shot when competition is in IDLE (training mode)', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue({
      phase: 'IDLE',
      canAcceptShot: () => true,
    });

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should allow shot when competition guard accepts', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue({
      phase: 'MATCH',
      canAcceptShot: () => true,
    });

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should allow shot when no active competition exists', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler(shotData);

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('should not throw when command execution fails', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);
    (commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Command failed'));

    const handler = createShotIngestionHandler(deps);

    // Should not throw — error is caught internally
    await expect(handler(shotData)).resolves.toBeUndefined();
  });

  it('should handle deviceScore as undefined', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 0, y: 0, timestamp: new Date() });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { deviceScore?: number };
    expect(input.deviceScore).toBeUndefined();
  });

  it('should pass impactPoint: null when x and y are null (miss shot)', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: null, y: null, timestamp: new Date(), score: 0 });

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: unknown };
    expect(input.impactPoint).toBeNull();
  });

  it('should pass impactPoint: null when only x is null', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: null, y: 1.0, timestamp: new Date() });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { impactPoint: unknown };
    expect(input.impactPoint).toBeNull();
  });

  it('should pass mode from ShotData to RecordShotCommand', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5, mode: 'MATCH' });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: { value: string } };
    expect(input.mode?.value).toBe('MATCH');
  });

  it('should pass mode: SIGHTING from ShotData to RecordShotCommand', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5, mode: 'SIGHTING' });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: { value: string } };
    expect(input.mode?.value).toBe('SIGHTING');
  });

  it('should pass mode: undefined when ShotData has no mode field', async () => {
    const session = buildSession();
    sessionRepository.findActive = vi.fn().mockResolvedValue(session);
    competitionRepository.findActive = vi.fn().mockResolvedValue(null);

    const handler = createShotIngestionHandler(deps);
    await handler({ x: 1.0, y: 2.0, timestamp: new Date(), score: 9.5 });

    const callArgs = (commandBus.execute as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const input = callArgs[1] as { mode?: unknown };
    expect(input.mode).toBeUndefined();
  });
});
