import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { competitionAnnouncementsModule } from '@/main/modules/competition-announcements';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import { competitionTypeFromRulePack, CompetitionTypeRegistry } from '@/shared/competitionTypes';
import { ISSF_2026_AR60 } from '@sasakiuri/saika-rules';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';

interface AnnouncementHandlers {
  getSettings(): Promise<{ enabled: boolean }>;
  setSettings(input: { enabled: boolean }): Promise<{ enabled: boolean }>;
}

describe('competitionAnnouncementsModule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps an authoritative MQTT timer to a Rule Pack reminder event', async () => {
    const listeners = new Map<string, (event: AnyDomainEvent) => void>();
    const emitted: AnyDomainEvent[] = [];
    const registration: { handlers: AnnouncementHandlers | null } = { handlers: null };
    let enabled = true;
    const competitionTypes = new CompetitionTypeRegistry();
    competitionTypes.register(competitionTypeFromRulePack(ISSF_2026_AR60));
    const output = competitionAnnouncementsModule.register({
      eventBus: {
        on: (eventType: string, handler: (event: AnyDomainEvent) => void) => {
          listeners.set(eventType, handler);
          return () => listeners.delete(eventType);
        },
        emit: (event: AnyDomainEvent) => emitted.push(event),
      } as never,
      ipcRouter: {
        register: vi.fn((_contract, registeredHandlers) => {
          registration.handlers = registeredHandlers as AnnouncementHandlers;
        }),
      } as never,
      appConfigService: {
        get: vi.fn(() => enabled),
        set: vi.fn((_key: string, value: boolean) => {
          enabled = value;
        }),
      } as never,
      competitionTypeRegistry: competitionTypes,
    });
    await output?.lifecycle?.[0]?.start();

    listeners.get('MqttControlStateChanged')?.({
      type: 'MqttControlStateChanged',
      timestamp: Date.now(),
      snapshot: {
        connected: true,
        brokerUrl: 'mqtt://localhost:1883',
        activeCompetitionId: COMPETITION_ID,
        lanes: [],
        competitions: [
          {
            competitionId: COMPETITION_ID,
            competitionTypeId: 'AR60',
            phase: 'SIGHTING',
            activeTimer: {
              timerScope: 'STAGE',
              timerStartAt: '2026-08-29T00:00:00.000Z',
              timerDurationSeconds: 900,
              stageIndex: 0,
              seriesIndex: null,
            },
          },
        ],
        lastCommand: null,
      },
    } as unknown as AnyDomainEvent);

    await vi.advanceTimersByTimeAsync(870_000);

    expect(emitted).toContainEqual({
      type: 'CompetitionAnnouncementDue',
      timestamp: Date.parse('2026-08-29T00:14:30.000Z'),
      competitionId: COMPETITION_ID,
      competitionTypeId: 'AR60',
      rulePackId: 'ISSF:2026:AR60:QUALIFICATION',
      phase: 'PREPARATION',
      remainingSeconds: 30,
      dueAt: '2026-08-29T00:14:30.000Z',
    });

    const handlers = registration.handlers;
    if (!handlers) throw new Error('Announcement handlers were not registered');
    await handlers.setSettings({ enabled: false });
    expect(await handlers.getSettings()).toEqual({ enabled: false });
    await output?.lifecycle?.[0]?.stop();
    expect(listeners.has('MqttControlStateChanged')).toBe(false);
  });
});
