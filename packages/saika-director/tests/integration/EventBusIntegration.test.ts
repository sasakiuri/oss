import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypedEventBus, type IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { CompetitionStarted, PhaseChanged, ShotReceived } from '@/main/domain/events';

describe('EventBusIntegration', () => {
  let eventBus: IEventBus;

  beforeEach(() => {
    eventBus = new TypedEventBus();
  });

  describe('Event Emission', () => {
    it('should call registered handler when event is emitted', () => {
      const handler = vi.fn();
      eventBus.on('CompetitionStarted', handler);

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test Competition',
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

      eventBus.on('PhaseChanged', handler1);
      eventBus.on('PhaseChanged', handler2);
      eventBus.on('PhaseChanged', handler3);

      const event: PhaseChanged = {
        type: 'PhaseChanged',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        phase: 'PREPARATION',
        remainingTime: 600,
      };

      eventBus.emit(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should call handlers in registration order', () => {
      const callOrder: number[] = [];

      eventBus.on('CompetitionStarted', () => callOrder.push(1));
      eventBus.on('CompetitionStarted', () => callOrder.push(2));
      eventBus.on('CompetitionStarted', () => callOrder.push(3));

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
      };

      eventBus.emit(event);

      expect(callOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Handler Unsubscription', () => {
    it('should not call handler after unsubscription', () => {
      const handler = vi.fn();
      const unsubscribe = eventBus.on('CompetitionStarted', handler);

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
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

      const unsubscribe1 = eventBus.on('PhaseChanged', handler1);
      eventBus.on('PhaseChanged', handler2);

      const event: PhaseChanged = {
        type: 'PhaseChanged',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        phase: 'MATCH',
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
      const unsubscribe = eventBus.on('CompetitionStarted', handler);

      // Multiple unsubscriptions should not throw
      unsubscribe();
      unsubscribe();

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
      };

      eventBus.emit(event);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Event Type Isolation', () => {
    it('should not call handler for different event types', () => {
      const competitionHandler = vi.fn();
      const phaseHandler = vi.fn();

      eventBus.on('CompetitionStarted', competitionHandler);
      eventBus.on('PhaseChanged', phaseHandler);

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
      };

      eventBus.emit(event);

      expect(competitionHandler).toHaveBeenCalledTimes(1);
      expect(phaseHandler).not.toHaveBeenCalled();
    });

    it('should handle events without registered handlers gracefully', () => {
      const handler = vi.fn();
      eventBus.on('CompetitionStarted', handler);

      // Emit an event type with no handlers registered
      const event: PhaseChanged = {
        type: 'PhaseChanged',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        phase: 'MATCH',
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

      eventBus.on('CompetitionStarted', errorHandler);
      eventBus.on('CompetitionStarted', successHandler);

      const event: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
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
      const competitionHandler = vi.fn();
      const shotHandler = vi.fn();

      eventBus.on('CompetitionStarted', competitionHandler);
      eventBus.on('ShotReceived', shotHandler);

      const compEvent: CompetitionStarted = {
        type: 'CompetitionStarted',
        timestamp: Date.now(),
        competitionId: 'comp-1',
        name: 'Test',
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

      eventBus.emit(compEvent);
      eventBus.emit(shotEvent);
      eventBus.emit(shotEvent);

      expect(competitionHandler).toHaveBeenCalledTimes(1);
      expect(shotHandler).toHaveBeenCalledTimes(2);
    });
  });
});
