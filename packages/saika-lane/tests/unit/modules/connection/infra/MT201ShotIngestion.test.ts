// SPDX-License-Identifier: MIT
import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RecordShotToken } from '@/main/composition/tokens';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S } from '@/main/modules/competition/domain/competitionTypes';
import { createShotIngestionHandler } from '@/main/modules/connection/infra/ShotIngestionHandler';
import { USBDataPipeline } from '@/main/modules/connection/infra/usb/USBDataPipeline';
import { USBEventEmitter } from '@/main/modules/connection/infra/usb/USBEventEmitter';
import { createRecordShotHandler } from '@/main/modules/session/application/handlers/RecordShotHandler';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { ScoreDiscrepancyDetector } from '@/main/modules/session/domain/ScoreDiscrepancyDetector';
import { Session } from '@/main/modules/session/domain/Session';
import { ScoreCalculationServiceImpl } from '@/main/modules/session/infra/ScoreCalculationServiceImpl';
import { SqliteSessionRepository } from '@/main/modules/session/infra/SqliteSessionRepository';
import { SqliteShotObservationRepository } from '@/main/modules/shot-observation/infra/SqliteShotObservationRepository';
import { MT201Adapter } from '@/main/modules/target/adapters/MT201Adapter';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import { DataConversionService } from '@/main/modules/target/infra/DataConversionService';
import { SerialDataParser } from '@/main/modules/target/infra/SerialDataParser';
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { ContractEventForwarder } from '@/main/shared-infra/ipc/ContractEventForwarder';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { eventsContract } from '@/shared/ipc/contracts';

import { createMockCompetitionRepository } from '../../../../helpers/mockDependencies';

vi.mock('@/main/shared-infra/logging/createLogger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), isLevelEnabled: () => false }),
}));

const close: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of close.splice(0)) cleanup();
});

describe('MT-201 shot ingestion', () => {
  it.each(['preparation', 'match'] as const)('records fragmented and consecutive shots during %s', async (stage) => {
    const database = createSqliteDb(':memory:');
    close.push(() => database.close());
    const sessions = new SqliteSessionRepository(database);
    const observations = new SqliteShotObservationRepository(database);
    const session = Session.create(Discipline.beamRifle10m());
    await sessions.save(session);
    let competition = CompetitionState.create('beam', session.id, BR60S.config).startStage();
    if (stage === 'match') competition = competition.endStage().advanceToNextStage().startNextSeries();
    const competitions = createMockCompetitionRepository();
    vi.mocked(competitions.findActive).mockResolvedValue(competition);
    const events = new TypedEventBus();
    const recorded = vi.fn();
    events.on('ShotRecorded', recorded);
    const send = vi.fn();
    new ContractEventForwarder(events, {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow).start();
    const commands = new CommandBus();
    commands.register(
      RecordShotToken,
      createRecordShotHandler(
        sessions,
        new ScoreCalculationServiceImpl(),
        events,
        new ScoreDiscrepancyDetector({ log: vi.fn() }),
      ),
    );
    const ingest = createShotIngestionHandler({
      commandBus: commands,
      sessionRepository: sessions,
      competitionRepository: competitions,
      shotObservationRepository: observations,
    });
    const emitter = new USBEventEmitter();
    const pending: Promise<void>[] = [];
    emitter.on('data', (data) => pending.push(ingest(data)));
    const errors = vi.fn();
    emitter.on('error', errors);
    const adapters = new AdapterRegistry();
    adapters.registerDeviceAdapter('MT201', new MT201Adapter());
    const pipeline = new USBDataPipeline(
      new SerialDataParser(SerialDataParser.defaultParsers()),
      new DataConversionService(adapters),
      emitter,
    );
    pipeline.setSessionContextProvider(() => ({ discipline: session.discipline, mode: Mode.sighting() }));
    const sound = vi.fn();
    pipeline.setOnShotDetected(sound);
    const config = { portName: 'COM3', baudRate: 9600, manufacturer: TargetManufacturer.kohto(), deviceId: 'MT201' };
    pipeline.processReceivedData(Buffer.from('S10.9 0000'), config);
    expect(sound).not.toHaveBeenCalled();
    pipeline.processReceivedData(Buffer.from(' 0000 00\r\n'), config);
    expect(sound).toHaveBeenCalledTimes(1);
    pipeline.processReceivedData(Buffer.from('S 9.7 0250 FF5F 70\r\n'), config);
    await Promise.all(pending);

    expect(errors).not.toHaveBeenCalled();
    expect(recorded).toHaveBeenCalledTimes(2);
    expect(sound).toHaveBeenCalledTimes(2);
    const shots = (await sessions.findById(session.id))!.allShots;
    expect(shots.map((entry) => entry.score.value)).toEqual([109, 97]);
    expect(shots.map((entry) => entry.shotNumber)).toEqual([1, 2]);
    expect(shots.every((entry) => entry.mode.value === (stage === 'match' ? 'MATCH' : 'SIGHTING'))).toBe(true);
    expect(shots[0]?.impactPoint).toMatchObject({ x: 0, y: 0 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      eventsContract.channels.shotRecorded,
      expect.objectContaining({
        sessionId: session.id,
        shot: expect.objectContaining({ score: 109, x: 0, y: 0, shotNumber: 1 }),
      }),
    );
    expect(database.prepare('SELECT outcome_type FROM shot_observation_outcomes').all()).toEqual([
      { outcome_type: 'RECORDED' },
      { outcome_type: 'RECORDED' },
    ]);
  });
});
