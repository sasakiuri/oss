import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypedEventBus, type IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { LanePhaseChanged } from '@/main/modules/lane-control';
import type { LaneConnected, ShotReceived } from '@/main/modules/mqtt';

describe('EventBusIntegration', () => {
  let eventBus: IEventBus;

  beforeEach(() => {
    eventBus = new TypedEventBus();
  });

  describe('Event Emission', () => {
    it('should call registered handler when event is emitted', () => {
      const handler = vi.fn();
      eventBus.on('LaneConnected', handler);

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      eventBus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should pass the complete event object to the handler', () => {
      const handler = vi.fn();
      eventBus.on('ShotReceived', handler);

      const event: ShotReceived = {
        type: 'ShotReceived',
        timestamp: 1234567890,
        competitionId: 'comp-1',
        channel: 3,
        shotNumber: 5,
        score: 10.2,
        seriesNumber: 1,
      };

      eventBus.emit(event);

      const receivedEvent = handler.mock.calls[0]![0] as ShotReceived;
      expect(receivedEvent.type).toBe('ShotReceived');
      expect(receivedEvent.channel).toBe(3);
      expect(receivedEvent.shotNumber).toBe(5);
      expect(receivedEvent.score).toBe(10.2);
      expect(receivedEvent.seriesNumber).toBe(1);
    });
  });

  describe('Multiple Handlers', () => {
    it('should call all handlers registered for the same event type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      eventBus.on('LanePhaseChanged', handler1);
      eventBus.on('LanePhaseChanged', handler2);
      eventBus.on('LanePhaseChanged', handler3);

      const event: LanePhaseChanged = {
        type: 'LanePhaseChanged',
        timestamp: Date.now(),
        laneId: 'lane-1',
        phase: 'ACTIVE',
        remainingTime: 600,
      };

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should call handlers in registration order', () => {
      const callOrder: number[] = [];

      eventBus.on('LaneConnected', () => callOrder.push(1));
      eventBus.on('LaneConnected', () => callOrder.push(2));
      eventBus.on('LaneConnected', () => callOrder.push(3));

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      eventBus.emit(event);

      expect(callOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Handler Unsubscription', () => {
    it('should not call handler after unsubscription', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('LaneConnected', handler);

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      // First emit - handler should be called
      eventBus.emit(event);
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second emit - handler should NOT be called
      eventBus.emit(event);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should only unsubscribe the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = eventBus.on('LanePhaseChanged', handler1);
      eventBus.on('LanePhaseChanged', handler2);

      const event: LanePhaseChanged = {
        type: 'LanePhaseChanged',
        timestamp: Date.now(),
        laneId: 'lane-1',
        phase: 'ACTIVE',
        remainingTime: 2700,
      };

      // Unsubscribe handler1 only
      unsubscribe1();

      eventBus.emit(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple unsubscriptions safely', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('LaneConnected', handler);

      // Multiple unsubscriptions should not throw
      unsubscribe();
      unsubscribe();

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      eventBus.emit(event);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Event Type Isolation', () => {
    it('should not call handler for different event types', () => {
      const connectionHandler = vi.fn();
      const phaseHandler = vi.fn();

      eventBus.on('LaneConnected', connectionHandler);
      eventBus.on('LanePhaseChanged', phaseHandler);

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      eventBus.emit(event);

      expect(connectionHandler).toHaveBeenCalledTimes(1);
      expect(phaseHandler).not.toHaveBeenCalled();
    });

    it('should handle events without registered handlers gracefully', () => {
      const handler = vi.fn();
      eventBus.on('LaneConnected', handler);

      // Emit an event type with no handlers registered
      const event: LanePhaseChanged = {
        type: 'LanePhaseChanged',
        timestamp: Date.now(),
        laneId: 'lane-1',
        phase: 'ACTIVE',
        remainingTime: 2700,
      };

      // Should not throw
      expect(() => eventBus.emit(event)).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should continue calling other handlers when one throws', () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      eventBus.on('LaneConnected', errorHandler);
      eventBus.on('LaneConnected', successHandler);

      const event: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      // Should not throw even though one handler throws
      expect(() => eventBus.emit(event)).not.toThrow();

      // Both handlers should have been called
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(successHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Multiple Event Emissions', () => {
    it('should handle rapid consecutive emissions', () => {
      const handler = vi.fn();
      eventBus.on('ShotReceived', handler);

      for (let i = 0; i < 100; i++) {
        const event: ShotReceived = {
          type: 'ShotReceived',
          timestamp: Date.now(),
          competitionId: 'comp-1',
          channel: 1,
          shotNumber: i + 1,
          score: 10.0,
          seriesNumber: Math.ceil((i + 1) / 10),
        };
        eventBus.emit(event);
      }

      expect(handler).toHaveBeenCalledTimes(100);
    });

    it('should emit different event types independently', () => {
      const connectionHandler = vi.fn();
      const shotHandler = vi.fn();

      eventBus.on('LaneConnected', connectionHandler);
      eventBus.on('ShotReceived', shotHandler);

      const connectionEvent: LaneConnected = {
        type: 'LaneConnected',
        timestamp: Date.now(),
        laneId: 'lane-1',
        channel: 1,
      };

      const shotEvent: ShotReceived = {
        type: 'ShotReceived',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        channel: 1,
        shotNumber: 1,
        score: 10.5,
        seriesNumber: 1,
      };

      eventBus.emit(connectionEvent);
      eventBus.emit(shotEvent);
      eventBus.emit(shotEvent);

      expect(connectionHandler).toHaveBeenCalledTimes(1);
      expect(shotHandler).toHaveBeenCalledTimes(2);
    });
  });
});
