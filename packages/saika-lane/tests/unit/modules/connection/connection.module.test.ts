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

import { ConnectToTargetToken, DisconnectFromTargetToken } from '@/main/composition/tokens';
import { connectionModule } from '@/main/modules/connection/connection.module';
import { Connection } from '@/main/modules/connection/domain/Connection';
import { Mode } from '@/main/modules/session/domain/Mode';
import { TargetManufacturer } from '@/main/modules/target/domain/TargetManufacturer';
import { connectionContract, eventsContract } from '@/shared/ipc/contracts';

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
  let eventBus: ReturnType<typeof createMockEventBus>;
  let ipcRouter: ReturnType<typeof createMockIpcRouter>;
  let connectionRepository: ReturnType<typeof createMockConnectionRepository>;
  let sessionRepository: ReturnType<typeof createMockSessionRepository>;
  let competitionRepository: ReturnType<typeof createMockCompetitionRepository>;
  let usbManager: ReturnType<typeof createMockUSBManager>;
  let mockWebContentsSend: ReturnType<typeof vi.fn>;
  let mockIsDestroyed: ReturnType<typeof vi.fn>;
  let mainWindow: { isDestroyed: ReturnType<typeof vi.fn>; webContents: { send: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    commandBus = createMockCommandBus();
    eventBus = createMockEventBus();
    ipcRouter = createMockIpcRouter();
    connectionRepository = createMockConnectionRepository();
    sessionRepository = createMockSessionRepository();
    competitionRepository = createMockCompetitionRepository();
    usbManager = createMockUSBManager();
    mockWebContentsSend = vi.fn();
    mockIsDestroyed = vi.fn().mockReturnValue(false);
    mainWindow = {
      isDestroyed: mockIsDestroyed,
      webContents: { send: mockWebContentsSend },
    };
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
  });

  describe('metadata', () => {
    it('should have name "connection"', () => {
      expect(connectionModule.name).toBe('connection');
    });

    it('should declare correct dependencies', () => {
      expect(connectionModule.deps).toEqual([
        'commandBus',
        'eventBus',
        'connectionRepository',
        'sessionRepository',
        'competitionRepository',
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
        eventBus,
        connectionRepository,
        sessionRepository,
        competitionRepository,
        usbManager,
        ipcRouter,
        mainWindow,
      } as never);
    }

    it('should register 2 command handlers', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledTimes(2);
    });

    it('should register ConnectToTarget command handler', () => {
      registerModule();

      expect(commandBus.register).toHaveBeenCalledWith(ConnectToTargetToken, expect.any(Function));
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
      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionStarted',
        aggregateId: 'session-1',
        discipline,
        timestamp: Date.now(),
      });

      expect(usbManager.resetShotCounter).toHaveBeenCalled();
    });

    it('should reset shot counter on SessionReset event', () => {
      registerModule();

      (eventBus.emit as ReturnType<typeof vi.fn>)({
        type: 'SessionReset',
        aggregateId: 'session-1',
        timestamp: Date.now(),
      });

      expect(usbManager.resetShotCounter).toHaveBeenCalled();
    });

    it('should bootstrap context from persisted active session', () => {
      registerModule();

      expect(sessionRepository.findActive).toHaveBeenCalledTimes(1);
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

        // Trigger USB data — should NOT cause IPC send (that's now in onShotDetected)
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
          | ((connection: Connection) => void)
          | undefined;
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
          | ((payload: { attempts: number; lastError: Error }) => void)
          | undefined;

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
          | ((connection: Connection) => void)
          | undefined;

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

      it('restores the current session mode after automatic reconnect', async () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'SessionStarted',
          aggregateId: 'session-1',
          discipline: { value: 'AIR_RIFLE_10M' },
          timestamp: Date.now(),
        });
        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'ModeSwitched',
          aggregateId: 'session-1',
          previousMode: Mode.sighting(),
          newMode: Mode.match(),
          timestamp: Date.now(),
        });
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
          | ((connection: Connection) => void)
          | undefined;

        disconnectedCallback?.();
        connectedCallback?.(reconnectedConnection);

        await vi.waitFor(() => {
          expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
        });
      });

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
          | ((payload: { attempts: number; lastError: Error }) => void)
          | undefined;
        const disconnectHandler = vi
          .mocked(commandBus.register)
          .mock.calls.find((call) => call[0] === DisconnectFromTargetToken)?.[1] as
          | ((input: { connectionId: string }) => Promise<void>)
          | undefined;

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

    describe('StageAdvanced listener', () => {
      it('should send Mode.match() when scored=true', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'StageAdvanced',
          aggregateId: 'comp-1',
          previousStageIndex: 0,
          newStageIndex: 1,
          stageName: 'Match',
          scored: true,
          timestamp: Date.now(),
        });

        expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
      });

      it('should send Mode.sighting() when scored=false', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
          type: 'StageAdvanced',
          aggregateId: 'comp-1',
          previousStageIndex: 0,
          newStageIndex: 1,
          stageName: 'Sighting',
          scored: false,
          timestamp: Date.now(),
        });

        expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.sighting());
      });

      it('should not propagate errors when sendMode fails', async () => {
        vi.mocked(usbManager.sendMode).mockRejectedValue(new Error('USB write failed'));
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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
      it('should send Mode.match() when IDLE→ACTIVE with scored=true', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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

        expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.match());
      });

      it('should send Mode.sighting() when IDLE→ACTIVE with scored=false', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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

        expect(usbManager.sendMode).toHaveBeenCalledWith(Mode.sighting());
      });

      it('should not send mode when previousPhase is not IDLE', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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

        expect(usbManager.sendMode).not.toHaveBeenCalled();
      });

      it('should not send mode when newPhase is not ACTIVE', () => {
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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

        expect(usbManager.sendMode).not.toHaveBeenCalled();
      });

      it('should not propagate errors when sendMode fails', async () => {
        vi.mocked(usbManager.sendMode).mockRejectedValue(new Error('USB write failed'));
        registerModule();

        (eventBus.emit as ReturnType<typeof vi.fn>)({
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
