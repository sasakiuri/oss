// SPDX-License-Identifier: MIT
import type Database from 'better-sqlite3';
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ConnectToTargetToken, DisconnectFromTargetToken, RecordShotToken } from '@/main/composition/tokens';
import { createShotRecordedHandler } from '@/main/modules/competition/application/CompetitionEventHandlers';
import { CompetitionState } from '@/main/modules/competition/domain/CompetitionState';
import { BR60S, R3P_FINAL } from '@/main/modules/competition/domain/competitionTypes';
import { connectionModule } from '@/main/modules/connection/connection.module';
import { Connection } from '@/main/modules/connection/domain/Connection';
import { Discipline } from '@/main/modules/session/domain/Discipline';
import { Mode } from '@/main/modules/session/domain/Mode';
import { Score } from '@/main/modules/session/domain/Score';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { createSqliteDb } from '@/main/shared-infra/sqlite/SqliteDb';
import { connectionContract, eventsContract } from '@/shared/ipc/contracts';

import { athleteCompetition } from '../../../helpers/athleteCompetition';
import { buildSession } from '../../../helpers/factories';
import {
  createMockCommandBus,
  createMockCompetitionRepository,
  createMockConnectionRepository,
  createMockEventBus,
  createMockIpcRouter,
  createMockSessionRepository,
  createMockUSBManager,
} from '../../../helpers/mockDependencies';

describe('connection.module', () => {
  let commandBus: ReturnType<typeof createMockCommandBus>;
  let database: Database.Database;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let connectionRepository: ReturnType<typeof createMockConnectionRepository>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let competitionRepository: ReturnType<typeof createMockCompetitionRepository>;
  let usbManager: ReturnType<typeof createMockUSBManager>;
  let getInterruption: Mock;
  let mockWebContentsSend: Mock;
  let mockIsDestroyed: Mock;
  let mainWindow: { isDestroyed: Mock; webContents: { send: Mock } };

  beforeEach(() => {
    commandBus = createMockCommandBus();
    database = createSqliteDb(':memory:');
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    connectionRepository = createMockConnectionRepository();
    sessionRepository = createMockSessionRepository();
    competitionRepository = createMockCompetitionRepository();
    usbManager = createMockUSBManager();
    getInterruption = vi.fn(() => null);
    mockWebContentsSend = vi.fn();
    mockIsDestroyed = vi.fn().mockReturnValue(false);
    mainWindow = {
      isDestroyed: mockIsDestroyed,
      webContents: { send: mockWebContentsSend },
    };
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
  });

  afterEach(() => {
    database.close();
  });

  describe('metadata', () => {
    it('should have name "connection"', () => {
      expect(connectionModule.name).toBe('connection');
    });

    it('should declare correct dependencies', () => {
      expect(connectionModule.deps).toEqual([
        'adapterRegistry',
        'commandBus',
        'database',
        'eventBus',
        'connectionRepository',
        'sessionRepository',
        'competitionRepository',
        'competitionInterruptionControl',
        'competitionShootOffControl',
        'timedTargetControl',
        'safetyStopControl',
        'usbManager',
        'ipcRouter',
        'mainWindow',
      ]);
    });
  });

  describe('register', () => {
    function registerModule() {
      connectionModule.register({
        commandBus,
        database,
        eventBus,
        connectionRepository,
        sessionRepository,
        competitionRepository,
        competitionInterruptionControl: { get: getInterruption },
        usbManager,
        ipcRouter,
        mainWindow,
      } as never);
    }

    function persistStage(scored: boolean) {
      const session = buildSession();
      let competition = CompetitionState.create('competition-1', session.id, BR60S.config).startStage();
      if (scored) competition = competition.endStage().advanceToNextStage().startNextSeries();
      vi.mocked(competitionRepository.findActive).mockResolvedValue(competition);
      vi.mocked(sessionRepository.findById).mockResolvedValue(session);
      return { competition, session };
    }

    async function registerWithStage(scored: boolean) {
      persistStage(scored);
      registerModule();
      const provider = vi.mocked(usbManager.setSessionContextProvider).mock.calls[0]![0];
      await vi.waitFor(() => expect(provider().mode.value).toBe(scored ? 'MATCH' : 'SIGHTING'));
      return provider;
    }

    it('should register 2 command handlers', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledTimes(2);
    });

    it('should register ConnectToTarget command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(ConnectToTargetToken, expect.any(Function));
    });

    it('should use the cached competition mode for an initial connection', async () => {
      persistStage(true);
      registerModule();

      (eventBus.emit as Mock)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline: { value: 'BEAM_PISTOL_10M' },
        timestamp: Date.now(),
      });
      (eventBus.emit as Mock)({
        type: 'PhaseChanged',
        aggregateId: 'competition-1',
        previousPhase: 'SERIES_ENTERED',
        newPhase: 'ACTIVE',
        stageIndex: 1,
        seriesIndex: 1,
        stageName: 'Match',
        scored: true,
        timestamp: Date.now(),
      });
      vi.mocked(usbManager.sendMode).mockClear();

      const connection = Connection.create({
        manufacturer: TargetManufacturer.kohto(),
        portPath: 'COM3',
        baudRate: 115200,
        deviceId: 'BPT216',
      }).connect();
      vi.mocked(usbManager.connect).mockResolvedValue(connection);
      const connectHandler = vi
        .mocked(commandBus.register)
        .mock.calls.find((call) => call[0] === ConnectToTargetToken)?.[1] as
        | ((input: {
            portName: string;
            manufacturer: TargetManufacturer;
            baudRate?: number;
            deviceId?: string;
          }) => Promise<void>)
        | undefined;

      await connectHandler?.({
        portName: 'COM3',
        manufacturer: TargetManufacturer.kohto(),
        baudRate: 115200,
        deviceId: 'BPT216',
      });

      expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
    });

    it('should await persisted competition mode recovery before the initial connection', async () => {
      const session = buildSession();
      const competition = CompetitionState.create('competition-1', session.id, BR60S.config)
        .startStage()
        .endStage()
        .advanceToNextStage()
        .startNextSeries();
      competitionRepository.findActive = vi.fn().mockResolvedValue(competition);
      sessionRepository.findById = vi.fn().mockResolvedValue(session);
      registerModule();

      const connection = Connection.create({
        manufacturer: TargetManufacturer.kohto(),
        portPath: 'COM3',
        baudRate: 115200,
        deviceId: 'BPT216',
      }).connect();
      vi.mocked(usbManager.connect).mockResolvedValue(connection);
      const connectHandler = vi
        .mocked(commandBus.register)
        .mock.calls.find((call) => call[0] === ConnectToTargetToken)?.[1] as
        | ((input: {
            portName: string;
            manufacturer: TargetManufacturer;
            baudRate?: number;
            deviceId?: string;
          }) => Promise<void>)
        | undefined;

      await connectHandler?.({
        portName: 'COM3',
        manufacturer: TargetManufacturer.kohto(),
        baudRate: 115200,
        deviceId: 'BPT216',
      });

      expect(sessionRepository.findById).toHaveBeenCalledWith(session.id);
      expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
    });

    it('should register DisconnectFromTarget command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(DisconnectFromTargetToken, expect.any(Function));
    });

    it('should register IPC handlers with connectionContract', () => {
      registerModule();

      expect(ipcRouter.register).toHaveBeenCalledTimes(1);
      expect(ipcRouter.register).toHaveBeenCalledWith(connectionContract, expect.any(Object));
    });

    it('should set session context provider on usbManager', () => {
      registerModule();

      expect(usbManager.setSessionContextProvider).toHaveBeenCalledTimes(1);
      expect(usbManager.setSessionContextProvider).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register shot ingestion handler on usbManager data event', () => {
      registerModule();

      expect(usbManager.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    it('routes authorized recovery sighting through the registered USB callback', async () => {
      const session = buildSession();
      const competition = CompetitionState.create('competition-1', session.id, BR60S.config)
        .startStage()
        .endStage()
        .advanceToNextStage()
        .startNextSeries();
      vi.mocked(competitionRepository.findActive).mockResolvedValue(competition);
      vi.mocked(sessionRepository.findById).mockResolvedValue(session);
      getInterruption.mockReturnValue({ competitionId: competition.id, status: 'SIGHTING' });
      registerModule();
      const dataHandler = vi.mocked(usbManager.on).mock.calls.find((call) => call[0] === 'data')?.[1] as (
        data: unknown,
      ) => Promise<void>;
      await dataHandler({ x: 0, y: 0, score: 100, mode: 'MATCH', timestamp: new Date() });
      expect(getInterruption).toHaveBeenCalledWith(competition.id);
      expect(commandBus.execute).toHaveBeenCalledWith(
        RecordShotToken,
        expect.objectContaining({
          sessionId: session.id,
          mode: Mode.sighting(),
        }),
      );
    });

    it('should register unexpected disconnect handler on usbManager', () => {
      registerModule();

      expect(usbManager.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    });

    it('should register reconnect recovery handlers on usbManager', () => {
      registerModule();

      expect(usbManager.on).toHaveBeenCalledWith('connected', expect.any(Function));
      expect(usbManager.on).toHaveBeenCalledWith('reconnectFailed', expect.any(Function));
    });

    it('should subscribe to SessionStarted event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('SessionStarted', expect.any(Function));
    });

    it('should subscribe to ModeSwitched event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('ModeSwitched', expect.any(Function));
    });

    it('should subscribe to SessionReset event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('SessionReset', expect.any(Function));
    });

    it('should reset shot counter on SessionStarted event', () => {
      registerModule();

      // Trigger SessionStarted event
      const discipline = { value: 'AIR_RIFLE_10M' };
      (eventBus.emit as Mock)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline,
        timestamp: Date.now(),
      });

      expect(usbManager.resetShotCounter).toHaveBeenCalled();
    });

    it('should reset shot counter on SessionReset event', () => {
      registerModule();

      (eventBus.emit as Mock)({
        type: 'SessionReset',
        aggregateId: 'session-1',
        timestamp: Date.now(),
      });

      expect(usbManager.resetShotCounter).toHaveBeenCalled();
    });

    it('should bootstrap context from persisted active session', async () => {
      registerModule();

      await vi.waitFor(() => expect(sessionRepository.findActive).toHaveBeenCalledTimes(1));
    });

    it('should subscribe to StageAdvanced event', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('StageAdvanced', expect.any(Function));
    });

    it('should subscribe to PhaseChanged event for initial stage start', () => {
      registerModule();

      expect(eventBus.on).toHaveBeenCalledWith('PhaseChanged', expect.any(Function));
    });

    describe('shotReceived IPC signal (via setOnShotDetected)', () => {
      it('should register onShotDetected callback on usbManager', () => {
        registerModule();

        expect(usbManager.setOnShotDetected).toHaveBeenCalledTimes(1);
        expect(usbManager.setOnShotDetected).toHaveBeenCalledWith(expect.any(Function));
      });

      it('should send shotReceived IPC event when callback is invoked', () => {
        registerModule();

        const callback = vi.mocked(usbManager.setOnShotDetected).mock.calls[0]![0] as () => void;
        callback();

        expect(mockWebContentsSend).toHaveBeenCalledWith(eventsContract.channels.shotReceived, {});
      });

      it('should not send shotReceived when window is destroyed', () => {
        registerModule();
        mockIsDestroyed.mockReturnValue(true);

        const callback = vi.mocked(usbManager.setOnShotDetected).mock.calls[0]![0] as () => void;
        callback();

        expect(mockWebContentsSend).not.toHaveBeenCalled();
      });

      it('should register data handler directly as handleShotIngestion (no IPC in data handler)', () => {
        registerModule();

        const dataHandler = vi.mocked(usbManager.on).mock.calls.find((call) => call[0] === 'data')?.[1] as (
          data: unknown,
        ) => void;

        expect(dataHandler).toBeDefined();

        // Shot detection sends the IPC notification before data ingestion.
        dataHandler({ x: 0, y: 0, score: 10 });

        expect(mockWebContentsSend).not.toHaveBeenCalled();
      });
    });

    describe('unexpected USB disconnect handling', () => {
      it('finalizes pending unexpected disconnect state before a manual reconnect command', async () => {
        registerModule();

        const activeConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB0',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        const manuallyReconnectedConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB1',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);

        const disconnectedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
        const connectedCallback = vi.mocked(usbManager.on).mock.calls.find((call) => call[0] === 'connected')?.[1] as
          ((connection: Connection) => void) | undefined;
        const connectHandler = vi
          .mocked(commandBus.register)
          .mock.calls.find((call) => call[0] === ConnectToTargetToken)?.[1] as
          | ((input: {
              portName: string;
              manufacturer: TargetManufacturer;
              deviceId?: string;
              baudRate?: number;
            }) => Promise<void>)
          | undefined;

        expect(disconnectedCallback).toBeDefined();
        expect(connectedCallback).toBeDefined();
        expect(connectHandler).toBeDefined();

        vi.mocked(usbManager.connect).mockImplementation(async () => {
          connectedCallback?.(manuallyReconnectedConnection);
          return manuallyReconnectedConnection;
        });

        disconnectedCallback?.();

        await connectHandler?.({
          portName: '/dev/ttyUSB1',
          manufacturer: TargetManufacturer.kohto(),
          deviceId: 'MT201',
        });

        expect(connectionRepository.save).toHaveBeenCalledTimes(2);
        expect(connectionRepository.save).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            id: activeConnection.id,
            status: expect.objectContaining({ value: 'DISCONNECTED' }),
          }),
        );
        expect(connectionRepository.save).toHaveBeenNthCalledWith(2, manuallyReconnectedConnection);

        expect(
          vi
            .mocked(eventBus.emit)
            .mock.calls.filter(
              ([event]) =>
                event && typeof event === 'object' && 'type' in event && event.type === 'ConnectionEstablished',
            ),
        ).toHaveLength(1);
      });

      it('persists disconnected state and emits ConnectionLost only after reconnect failure', async () => {
        registerModule();

        const activeConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB0',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);

        const disconnectedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
        const reconnectFailedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'reconnectFailed')?.[1] as
          ((payload: { attempts: number; lastError: Error }) => void) | undefined;

        expect(disconnectedCallback).toBeDefined();
        expect(reconnectFailedCallback).toBeDefined();
        disconnectedCallback?.();

        await vi.waitFor(() => {
          expect(connectionRepository.findActive).toHaveBeenCalledTimes(1);
        });

        expect(connectionRepository.save).not.toHaveBeenCalled();

        reconnectFailedCallback?.({ attempts: 3, lastError: new Error('Reconnect failed') });

        await vi.waitFor(() => {
          expect(connectionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
              id: activeConnection.id,
              status: expect.objectContaining({ value: 'DISCONNECTED' }),
            }),
          );
        });

        expect(eventBus.emit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ConnectionLost',
            aggregateId: activeConnection.id,
            reason: 'USB device disconnected unexpectedly',
          }),
        );
      });

      it('persists recovered connection and re-emits ConnectionEstablished after automatic reconnect', async () => {
        registerModule();

        const activeConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB0',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        const reconnectedConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB1',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);

        const disconnectedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
        const connectedCallback = vi.mocked(usbManager.on).mock.calls.find((call) => call[0] === 'connected')?.[1] as
          ((connection: Connection) => void) | undefined;

        expect(disconnectedCallback).toBeDefined();
        expect(connectedCallback).toBeDefined();
        disconnectedCallback?.();
        connectedCallback?.(reconnectedConnection);

        await vi.waitFor(() => {
          expect(connectionRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
              id: activeConnection.id,
              status: expect.objectContaining({ value: 'DISCONNECTED' }),
            }),
          );
          expect(connectionRepository.save).toHaveBeenCalledWith(reconnectedConnection);
        });

        expect(eventBus.emit).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'ConnectionEstablished',
            aggregateId: reconnectedConnection.id,
            portPath: '/dev/ttyUSB1',
          }),
        );
      });

      it.each(['ModeSwitched', 'AthleteTargetModeChanged'] as const)(
        'restores the cached mode after automatic reconnect (%s)',
        async (eventType) => {
          registerModule();

          (eventBus.emit as Mock)({
            type: 'SessionStarted',
            aggregateId: 'session-1',
            discipline: { value: 'AIR_RIFLE_10M' },
            timestamp: Date.now(),
          });
          (eventBus.emit as Mock)({
            type: eventType,
            aggregateId: 'session-1',
            previousMode: Mode.sighting(),
            newMode: Mode.match(),
            timestamp: Date.now(),
          });
          expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
          vi.mocked(usbManager.sendMode).mockClear();

          const activeConnection = Connection.create({
            manufacturer: TargetManufacturer.kohto(),
            portPath: '/dev/ttyUSB0',
            baudRate: 9600,
            deviceId: 'MT201',
          }).connect();
          const reconnectedConnection = Connection.create({
            manufacturer: TargetManufacturer.kohto(),
            portPath: '/dev/ttyUSB1',
            baudRate: 9600,
            deviceId: 'MT201',
          }).connect();
          vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);

          const disconnectedCallback = vi
            .mocked(usbManager.on)
            .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
          const connectedCallback = vi.mocked(usbManager.on).mock.calls.find((call) => call[0] === 'connected')?.[1] as
            ((connection: Connection) => void) | undefined;

          disconnectedCallback?.();
          connectedCallback?.(reconnectedConnection);

          await vi.waitFor(() => {
            expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
          });
        },
      );

      it('does not emit an unexpected ConnectionLost after the user manually disconnects during reconnect recovery', async () => {
        registerModule();

        const activeConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB0',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);
        vi.mocked(connectionRepository.findById).mockResolvedValue(activeConnection);

        const disconnectedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
        const reconnectFailedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'reconnectFailed')?.[1] as
          ((payload: { attempts: number; lastError: Error }) => void) | undefined;
        const disconnectHandler = vi
          .mocked(commandBus.register)
          .mock.calls.find((call) => call[0] === DisconnectFromTargetToken)?.[1] as
          ((input: { connectionId: string }) => Promise<void>) | undefined;

        expect(disconnectedCallback).toBeDefined();
        expect(reconnectFailedCallback).toBeDefined();
        expect(disconnectHandler).toBeDefined();

        disconnectedCallback?.();

        await vi.waitFor(() => {
          expect(connectionRepository.findActive).toHaveBeenCalledTimes(1);
        });

        await disconnectHandler?.({ connectionId: activeConnection.id });
        reconnectFailedCallback?.({ attempts: 3, lastError: new Error('Reconnect failed') });

        await new Promise((resolve) => setTimeout(resolve, 0));

        const connectionLostReasons = vi
          .mocked(eventBus.emit)
          .mock.calls.filter(
            ([event]) => event && typeof event === 'object' && 'type' in event && event.type === 'ConnectionLost',
          )
          .map(([event]) => (event as { reason: string }).reason);

        expect(connectionRepository.save).toHaveBeenCalledTimes(1);
        expect(connectionLostReasons).toEqual(['User requested disconnection']);
      });

      it('emits ConnectionLost before surfacing a failed manual reconnect after an unexpected disconnect', async () => {
        registerModule();

        const activeConnection = Connection.create({
          manufacturer: TargetManufacturer.kohto(),
          portPath: '/dev/ttyUSB0',
          baudRate: 9600,
          deviceId: 'MT201',
        }).connect();
        vi.mocked(connectionRepository.findActive).mockResolvedValue(activeConnection);
        vi.mocked(usbManager.connect).mockRejectedValue(new Error('Manual reconnect failed'));

        const disconnectedCallback = vi
          .mocked(usbManager.on)
          .mock.calls.find((call) => call[0] === 'disconnected')?.[1] as (() => void) | undefined;
        const connectHandler = vi
          .mocked(commandBus.register)
          .mock.calls.find((call) => call[0] === ConnectToTargetToken)?.[1] as
          | ((input: {
              portName: string;
              manufacturer: TargetManufacturer;
              deviceId?: string;
              baudRate?: number;
            }) => Promise<void>)
          | undefined;

        expect(disconnectedCallback).toBeDefined();
        expect(connectHandler).toBeDefined();

        disconnectedCallback?.();

        await vi.waitFor(() => {
          expect(connectionRepository.findActive).toHaveBeenCalledTimes(1);
        });

        await expect(
          connectHandler?.({
            portName: '/dev/ttyUSB1',
            manufacturer: TargetManufacturer.kohto(),
            deviceId: 'MT201',
          }),
        ).rejects.toThrow('Manual reconnect failed');

        const connectionLostEvents = vi
          .mocked(eventBus.emit)
          .mock.calls.filter(
            ([event]) => event && typeof event === 'object' && 'type' in event && event.type === 'ConnectionLost',
          );

        expect(connectionRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            id: activeConnection.id,
            status: expect.objectContaining({ value: 'DISCONNECTED' }),
          }),
        );
        expect(connectionLostEvents).toEqual([
          [
            expect.objectContaining({
              type: 'ConnectionLost',
              aggregateId: activeConnection.id,
              reason: 'USB device disconnected unexpectedly',
            }),
          ],
        ]);
      });
    });

    it('sends only a changed observed target mode, including the first-Match cutoff', async () => {
      let session = buildSession({ discipline: Discipline.rifle50m() });
      let competition = CompetitionState.reconstruct({ ...athleteCompetition(), sessionId: session.id });
      const context = {
        competitionId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
        athleteModeObserved: true as const,
      };
      session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.sighting(), {
        competitionContext: context,
      });
      vi.mocked(competitionRepository.findActive).mockImplementation(async () => competition);
      vi.mocked(sessionRepository.findById).mockImplementation(async () => session);
      registerModule();
      const provider = vi.mocked(usbManager.setSessionContextProvider).mock.calls[0]![0];
      await vi.waitFor(() => expect(provider().mode.value).toBe('SIGHTING'));
      expect(usbManager.sendMode).not.toHaveBeenCalled();
      eventBus.emit({
        type: 'StageAdvanced',
        timestamp: Date.now(),
        aggregateId: competition.id,
        previousStageIndex: 0,
        newStageIndex: 1,
        stageName: 'Match',
        scored: true,
      });
      await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(2));
      expect(usbManager.sendMode).not.toHaveBeenCalled();
      eventBus.emit({
        type: 'ShotRecorded',
        timestamp: Date.now(),
        aggregateId: session.id,
        shot: session.allShots.at(-1)!,
        scoringMode: 'DECIMAL',
      });
      await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(3));
      expect(usbManager.sendMode).not.toHaveBeenCalled();
      session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match(), {
        competitionContext: context,
      });
      competition = competition.recordShotInSeries();
      eventBus.emit({
        type: 'CompetitionProgressChanged',
        timestamp: Date.now(),
        aggregateId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
        shotCount: 1,
      });
      await vi.waitFor(() => expect(provider().mode.value).toBe('MATCH'));
      expect(usbManager.sendMode).toHaveBeenCalledExactlyOnceWith(Mode.match());
    });

    it('sends Sighting at the automatic Final Standing changeover, without resending unchanged progress', async () => {
      let session = buildSession({ discipline: Discipline.rifle50m() });
      let competition = athleteCompetition(R3P_FINAL).withSessionId(session.id);
      for (let i = 0; i < 8; i++) competition = competition.recordShotInSeries();
      expect(competition.currentSeriesConfig).toMatchObject({ position: 'PRONE', targetModeControl: 'ATHLETE' });
      vi.mocked(competitionRepository.findActive).mockImplementation(async () => competition);
      vi.mocked(competitionRepository.save).mockImplementation(async (state) => {
        competition = state;
      });
      vi.mocked(sessionRepository.findById).mockImplementation(async () => session);
      registerModule();
      const provider = vi.mocked(usbManager.setSessionContextProvider).mock.calls[0]![0];
      await vi.waitFor(() => expect(provider().mode.value).toBe('MATCH'));
      const recordProgress = createShotRecordedHandler({ competitionRepository, eventBus });
      const fire = async () => {
        session = session.recordShot(null, new Score(100), new Date(), undefined, false, Mode.match(), {
          competitionContext: {
            competitionId: competition.id,
            stageIndex: competition.currentStageIndex,
            seriesIndex: competition.currentSeriesIndex,
            athleteModeObserved: true,
          },
        });
        const event = {
          type: 'ShotRecorded' as const,
          aggregateId: session.id,
          timestamp: Date.now(),
          shot: session.allShots.at(-1)!,
          scoringMode: 'DECIMAL' as const,
        };
        eventBus.emit(event);
        await recordProgress(event);
      };

      await fire();
      await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(2));
      expect(competition.seriesShotCount).toBe(9);
      expect(usbManager.sendMode).not.toHaveBeenCalled();
      await fire();
      await vi.waitFor(() => expect(usbManager.sendMode).toHaveBeenCalledExactlyOnceWith(Mode.sighting()));
      expect(competition.currentSeriesConfig).toMatchObject({
        position: 'STANDING',
        purpose: 'POSITION_CHANGE_AND_SIGHTING',
        targetModeControl: 'ATHLETE',
      });
      expect(provider().mode.value).toBe('SIGHTING');
      eventBus.emit({
        type: 'CompetitionProgressChanged',
        timestamp: Date.now(),
        aggregateId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
        shotCount: 0,
      });
      eventBus.emit({
        type: 'CompetitionProgressChanged',
        timestamp: Date.now(),
        aggregateId: competition.id,
        stageIndex: competition.currentStageIndex,
        seriesIndex: competition.currentSeriesIndex,
        shotCount: 0,
      });
      await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(5));
      expect(usbManager.sendMode).toHaveBeenCalledExactlyOnceWith(Mode.sighting());
    });

    describe('StageAdvanced listener', () => {
      it('sends the persisted scored-stage mode after StageAdvanced', async () => {
        await registerWithStage(false);
        persistStage(true);

        (eventBus.emit as Mock)({
          type: 'StageAdvanced',
          aggregateId: 'comp-1',
          previousStageIndex: 0,
          newStageIndex: 1,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match()));
      });

      it('sends the persisted unscored-stage mode after StageAdvanced', async () => {
        await registerWithStage(true);
        persistStage(false);

        (eventBus.emit as Mock)({
          type: 'StageAdvanced',
          aggregateId: 'comp-1',
          previousStageIndex: 0,
          newStageIndex: 1,
          stageName: 'Sighting',
          scored: false,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.sighting()));
      });

      it('should not propagate errors when sendMode fails', async () => {
        vi.mocked(usbManager.sendMode).mockRejectedValue(new Error('USB write failed'));
        await registerWithStage(false);
        persistStage(true);

        (eventBus.emit as Mock)({
          type: 'StageAdvanced',
          aggregateId: 'comp-1',
          previousStageIndex: 0,
          newStageIndex: 1,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => {
          expect(usbManager.sendMode).toHaveBeenCalled();
        });
      });
    });

    describe('PhaseChanged listener (initial stage start)', () => {
      it('sends the persisted scored-stage mode on initial start', async () => {
        await registerWithStage(false);
        persistStage(true);

        (eventBus.emit as Mock)({
          type: 'PhaseChanged',
          aggregateId: 'comp-1',
          previousPhase: 'IDLE',
          newPhase: 'ACTIVE',
          stageIndex: 0,
          seriesIndex: 0,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match()));
      });

      it('sends the persisted unscored-stage mode on initial start', async () => {
        await registerWithStage(true);
        persistStage(false);

        (eventBus.emit as Mock)({
          type: 'PhaseChanged',
          aggregateId: 'comp-1',
          previousPhase: 'IDLE',
          newPhase: 'ACTIVE',
          stageIndex: 0,
          seriesIndex: 0,
          stageName: 'Sighting',
          scored: false,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.sighting()));
      });

      it('does not resend an unchanged mode on a noninitial phase event', async () => {
        await registerWithStage(true);

        (eventBus.emit as Mock)({
          type: 'PhaseChanged',
          aggregateId: 'comp-1',
          previousPhase: 'SERIES_COMPLETE',
          newPhase: 'ACTIVE',
          stageIndex: 0,
          seriesIndex: 0,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(2));
        expect(usbManager.sendMode).not.toHaveBeenCalled();
      });

      it('does not resend an unchanged mode on a non-ACTIVE phase event', async () => {
        await registerWithStage(true);

        (eventBus.emit as Mock)({
          type: 'PhaseChanged',
          aggregateId: 'comp-1',
          previousPhase: 'IDLE',
          newPhase: 'FINISHED',
          stageIndex: 0,
          seriesIndex: 0,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => expect(sessionRepository.findById).toHaveBeenCalledTimes(2));
        expect(usbManager.sendMode).not.toHaveBeenCalled();
      });

      it('should not propagate errors when sendMode fails', async () => {
        vi.mocked(usbManager.sendMode).mockRejectedValue(new Error('USB write failed'));
        await registerWithStage(false);
        persistStage(true);

        (eventBus.emit as Mock)({
          type: 'PhaseChanged',
          aggregateId: 'comp-1',
          previousPhase: 'IDLE',
          newPhase: 'ACTIVE',
          stageIndex: 0,
          seriesIndex: 0,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        await vi.waitFor(() => {
          expect(usbManager.sendMode).toHaveBeenCalled();
        });
      });
    });
  });
});
