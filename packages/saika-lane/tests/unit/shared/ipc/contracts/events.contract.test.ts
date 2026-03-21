// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { eventsContract } from '@/shared/ipc/contracts/events.contract';

describe('eventsContract', () => {
  it('has 16 events', () => {
    const eventKeys = Object.keys(eventsContract.events);
    expect(eventKeys).toHaveLength(16);
  });

  it('all events have kind=event', () => {
    for (const evt of Object.values(eventsContract.events)) {
      expect(evt.kind).toBe('event');
    }
  });

  it('has the expected channel names configured', () => {
    expect(eventsContract.channels.shotReceived).toBe('event:shotReceived');
    expect(eventsContract.channels.shotRecorded).toBe('event:shotRecorded');
    expect(eventsContract.channels.connectionStatusChanged).toBe('event:connectionStatusChanged');
    expect(eventsContract.channels.sessionStarted).toBe('event:sessionStarted');
    expect(eventsContract.channels.modeSwitched).toBe('event:modeSwitched');
    expect(eventsContract.channels.sessionReset).toBe('event:sessionReset');
    expect(eventsContract.channels.error).toBe('error');
    expect(eventsContract.channels.logMessage).toBe('log:message');
    expect(eventsContract.channels.competitionStarted).toBe('event:competitionStarted');
    expect(eventsContract.channels.phaseChanged).toBe('event:phaseChanged');
    expect(eventsContract.channels.timerTick).toBe('event:timerTick');
    expect(eventsContract.channels.timerExpired).toBe('event:timerExpired');
    expect(eventsContract.channels.seriesCompleted).toBe('event:seriesCompleted');
    expect(eventsContract.channels.stageAdvanced).toBe('event:stageAdvanced');
    expect(eventsContract.channels.competitionFinished).toBe('event:competitionFinished');
  });

  it('shotReceived schema accepts valid data', () => {
    const schema = eventsContract.events.shotReceived.schema;
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('shotRecorded schema accepts valid data', () => {
    const schema = eventsContract.events.shotRecorded.schema;
    const result = schema.safeParse({
      sessionId: 'sess-1',
      shot: {
        id: 'shot-1',
        shotNumber: 1,
        x: 1.5,
        y: -2.0,
        score: 105,
        innerTen: false,
        timestamp: '2026-01-01T00:00:00Z',
        mode: 'MATCH',
        isRecorded: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('connectionStatusChanged schema accepts valid data', () => {
    const schema = eventsContract.events.connectionStatusChanged.schema;
    const result = schema.safeParse({
      connectionId: 'conn-1',
      status: 'connected',
      manufacturer: 'KOHTO',
      portPath: '/dev/ttyUSB0',
    });
    expect(result.success).toBe(true);
  });

  it('logMessage schema accepts valid data', () => {
    const schema = eventsContract.events.logMessage.schema;
    const result = schema.safeParse({
      entry: {
        id: 'log-1',
        timestamp: '2026-01-01T00:00:00Z',
        level: 'info',
        message: 'Connected',
        source: 'usb',
      },
    });
    expect(result.success).toBe(true);
  });

  it('phaseChanged schema accepts valid data', () => {
    const schema = eventsContract.events.phaseChanged.schema;
    const result = schema.safeParse({
      previousPhase: 'IDLE',
      newPhase: 'ACTIVE',
      stageIndex: 0,
      seriesIndex: 0,
      stageName: 'Preparation',
      scored: false,
    });
    expect(result.success).toBe(true);
  });
});
