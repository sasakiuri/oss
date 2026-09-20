import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Logger
vi.mock('@/shared/utils/Logger', () => ({
  Logger: {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      logError: vi.fn(),
      userAction: vi.fn(),
    })),
  },
}));

// Setup window.electronAPI mock before importing
const mockMethods = {
  laneControl: {
    getAll: vi.fn(),
    startPreparation: vi.fn(),
    advanceStage: vi.fn(),
    startSeries: vi.fn(),
    finish: vi.fn(),
    clear: vi.fn(),
    assignPlayers: vi.fn(),
    moveLane: vi.fn(),
    editShot: vi.fn(),
    deleteShot: vi.fn(),
    insertShot: vi.fn(),
    eliminate: vi.fn(),
    getScoreSheets: vi.fn(),
  },
  championship: {
    getChampionships: vi.fn(),
    getChampionshipDetail: vi.fn(),
    getParticipants: vi.fn(),
    getFiringPointAssignments: vi.fn(),
    createChampionship: vi.fn(),
    updateChampionship: vi.fn(),
    deleteChampionship: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn(),
    saveParticipants: vi.fn(),
    saveFiringPointAssignments: vi.fn(),
  },
  board: {
    openTargetBoard: vi.fn(),
    openRankingBoard: vi.fn(),
    openResultsBoard: vi.fn(),
    openFinalBoard: vi.fn(),
    openScoreSheetPrint: vi.fn(),
    openResultsListPrint: vi.fn(),
    closeBoard: vi.fn(),
    getConfig: vi.fn(),
    getLiveRanking: vi.fn(),
  },
  mqtt: {
    getBrokerConfig: vi.fn(),
    setBrokerConfig: vi.fn(),
    getBrokerStatus: vi.fn(),
    startBroker: vi.fn(),
    stopBroker: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  results: {
    publish: vi.fn(),
    publishFinal: vi.fn(),
    confirm: vi.fn(),
    getByEvent: vi.fn(),
    getByRelay: vi.fn(),
    getFinalByEvent: vi.fn(),
  },
  shootoff: {
    start: vi.fn(),
    addShot: vi.fn(),
    completeRound: vi.fn(),
    resolve: vi.fn(),
    getActive: vi.fn(),
  },
  queries: {
    getDebugLog: vi.fn(),
  },
};

Object.defineProperty(globalThis, 'window', {
  value: { electronAPI: mockMethods },
  writable: true,
});

// NOW import createApiService
import { createApiService } from '@/renderer/services/createApiService';

describe('createApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Proxy wrapping', () => {
    it('should create a proxy that delegates to window.electronAPI namespace', async () => {
      const expected = { success: true, data: [] };
      mockMethods.laneControl.getAll.mockResolvedValue(expected);

      const service = createApiService('laneControl');
      const result = await service.getAll();

      expect(result).toBe(expected);
      expect(mockMethods.laneControl.getAll).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments through to the underlying method', async () => {
      const payload = { laneIds: ['lane-1', 'lane-2'] };
      mockMethods.laneControl.startPreparation.mockResolvedValue({ success: true });

      const service = createApiService('laneControl');
      await service.startPreparation(payload);

      expect(mockMethods.laneControl.startPreparation).toHaveBeenCalledWith(payload);
    });

    it('should propagate errors from the underlying method', async () => {
      const error = new Error('IPC error');
      mockMethods.championship.getChampionships.mockRejectedValue(error);

      const service = createApiService('championship');
      await expect(service.getChampionships()).rejects.toThrow('IPC error');
    });
  });

  describe('namespace coverage', () => {
    const testCases: Array<{
      namespace: keyof typeof mockMethods;
      method: string;
      args?: unknown[];
    }> = [
      { namespace: 'laneControl', method: 'getAll' },
      { namespace: 'laneControl', method: 'startPreparation', args: [{ laneIds: ['l1'] }] },
      {
        namespace: 'laneControl',
        method: 'moveLane',
        args: [{ fromLaneId: 'a', toLaneId: 'b' }],
      },
      { namespace: 'championship', method: 'getChampionships' },
      { namespace: 'championship', method: 'getChampionshipDetail', args: [{ id: 'c1' }] },
      { namespace: 'board', method: 'openRankingBoard' },
      {
        namespace: 'board',
        method: 'openTargetBoard',
        args: [{ laneRange: { from: 1, to: 4 } }],
      },
      { namespace: 'board', method: 'closeBoard', args: ['window-1'] },
      { namespace: 'mqtt', method: 'getBrokerConfig' },
      { namespace: 'mqtt', method: 'setBrokerConfig', args: [{ mode: 'embedded' }] },
      {
        namespace: 'results',
        method: 'publish',
        args: [{ eventId: 'e1', laneIds: ['l1'] }],
      },
      { namespace: 'results', method: 'getByEvent', args: [{ eventId: 'e1' }] },
      { namespace: 'shootoff', method: 'completeRound', args: [{ shootoffId: 's1' }] },
      {
        namespace: 'shootoff',
        method: 'resolve',
        args: [{ shootoffId: 's1', rankedLaneIds: ['l1'] }],
      },
      { namespace: 'queries', method: 'getDebugLog' },
    ];

    it.each(testCases)('should proxy $namespace.$method', async ({ namespace, method, args }) => {
      const expected = { success: true };
      const mockNs = mockMethods[namespace] as Record<string, ReturnType<typeof vi.fn>>;
      mockNs[method]!.mockResolvedValue(expected);

      const service = createApiService(namespace as any);
      const fn = (service as Record<string, (...a: unknown[]) => unknown>)[method]!;
      const result = args ? await fn(...args) : await fn();

      expect(result).toBe(expected);
      expect(mockNs[method]).toHaveBeenCalledWith(...(args ?? []));
      expect(mockNs[method]).toHaveBeenCalledTimes(1);
    });
  });

  describe('error logging via createServiceMethod', () => {
    it('should re-throw errors from the underlying method', async () => {
      const error = new Error('Network failure');
      mockMethods.board.getConfig.mockRejectedValue(error);

      const service = createApiService('board');
      await expect(service.getConfig()).rejects.toThrow('Network failure');
    });

    it('should not swallow errors for any namespace', async () => {
      const namespaces = ['laneControl', 'championship', 'board', 'mqtt', 'results', 'shootoff', 'queries'] as const;

      for (const ns of namespaces) {
        const mockNs = mockMethods[ns] as Record<string, ReturnType<typeof vi.fn>>;
        const firstMethod = Object.keys(mockNs)[0]!;
        mockNs[firstMethod]!.mockRejectedValue(new Error(`${ns} error`));

        const service = createApiService(ns as any);
        const fn = (service as Record<string, (...a: unknown[]) => unknown>)[firstMethod]!;

        await expect(fn()).rejects.toThrow(`${ns} error`);
        mockNs[firstMethod]!.mockReset();
      }
    });
  });

  describe('index.ts barrel exports', () => {
    it('should export all 7 services', async () => {
      // Import from the barrel
      const services = await import('@/renderer/services');

      expect(services.laneControlService).toBeDefined();
      expect(services.championshipService).toBeDefined();
      expect(services.boardService).toBeDefined();
      expect(services.mqttService).toBeDefined();
      expect(services.resultsService).toBeDefined();
      expect(services.shootoffService).toBeDefined();
      expect(services.debugService).toBeDefined();
    });
  });
});
