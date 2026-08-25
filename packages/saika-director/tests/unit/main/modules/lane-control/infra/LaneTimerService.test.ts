import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { ILaneControlRepository } from '@/main/modules/lane-control/domain/ILaneControlRepository';
import { LaneTimerService } from '@/main/modules/lane-control/infra/LaneTimerService';

describe('LaneTimerService', () => {
  let mockRepository: ILaneControlRepository;
  let mockEventBus: IEventBus;
  let service: LaneTimerService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByChannel: vi.fn(),
      findAll: vi.fn(() => []),
      findActive: vi.fn(() => []),
      delete: vi.fn(),
    };
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
    };
    service = new LaneTimerService(mockRepository, mockEventBus);
  });

  afterEach(() => {
    service.stopAllTimers();
    vi.useRealTimers();
  });

  describe('startTimer', () => {
    it('reinitializes lastTickTime when called again with the same laneId', () => {
      service.startTimer('lane-1');

      vi.advanceTimersByTime(500);

      service.startTimer('lane-1');

      service.stopTimer('lane-1');
    });

    it('starts the global tick when startTimer is called', () => {
      const lane = {
        timer: { isExpired: false, remainingSeconds: 50, totalSeconds: 50 },
        phase: 'ACTIVE',
        remainingTime: 50,
        tickTimer: vi.fn().mockReturnThis(),
      };
      vi.mocked(mockRepository.findById).mockReturnValue(lane as any);

      service.startTimer('lane-1');

      vi.advanceTimersByTime(1000);

      expect(mockRepository.findById).toHaveBeenCalledWith('lane-1');
    });

    it('retains delayed tick fractions and follows real elapsed time', () => {
      vi.setSystemTime(0);
      const lane = {
        timer: { isExpired: false, remainingSeconds: 50, totalSeconds: 50 },
        phase: 'ACTIVE',
        remainingTime: 50,
        tickTimer: vi.fn(),
      };
      lane.tickTimer.mockReturnValue(lane);
      vi.mocked(mockRepository.findById).mockReturnValue(lane as any);
      service.startTimer('lane-1');

      const runGlobalTick = () => (service as unknown as { globalTick: () => void }).globalTick();

      vi.setSystemTime(1_499);
      runGlobalTick();
      vi.setSystemTime(2_998);
      runGlobalTick();
      vi.setSystemTime(4_497);
      runGlobalTick();

      expect(lane.tickTimer.mock.calls.map(([elapsed]) => elapsed)).toEqual([1, 1, 2]);
    });
  });

  describe('restoreActiveTimers', () => {
    it('resumes persisted active lane timers on startup', () => {
      const activeLane = {
        id: 'lane-active',
        phase: 'ACTIVE',
        timer: { isExpired: false, remainingSeconds: 50, totalSeconds: 50 },
        remainingTime: 50,
        tickTimer: vi.fn(),
      };
      activeLane.tickTimer.mockReturnValue(activeLane);
      vi.mocked(mockRepository.findActive).mockReturnValue([
        activeLane,
        { id: 'lane-between-stages', phase: 'STAGE_COMPLETE', timer: null },
      ] as any);
      vi.mocked(mockRepository.findById).mockImplementation((laneId) =>
        laneId === activeLane.id ? (activeLane as any) : undefined,
      );

      service.restoreActiveTimers();
      vi.advanceTimersByTime(1000);

      expect(mockRepository.findById).toHaveBeenCalledTimes(1);
      expect(mockRepository.findById).toHaveBeenCalledWith(activeLane.id);
      expect(activeLane.tickTimer).toHaveBeenCalledWith(1);
    });
  });
});
