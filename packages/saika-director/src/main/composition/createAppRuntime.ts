// SPDX-License-Identifier: MIT
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { ConsoleForwarder } from '@/main/infrastructure/logging/ConsoleForwarder';
import type { PhaseChanged, TimerExpired, TimerTick } from '@/main/shared-infra/events/coreEvents';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import type { ModuleLoadResult } from '@/main/shared-infra/module/ModuleLoader';
import { eventsContract } from '@/shared/ipc/contracts';
import type { CompetitionServices } from './createCompetitionServices';

type Dependencies = Pick<ServiceRegistry, 'eventBus' | 'windowManager' | 'laneTimerService'> &
  Pick<CompetitionServices, 'laneControlRepository'> &
  ModuleLoadResult & { databaseManager: DatabaseManager; consoleForwarder: ConsoleForwarder };

/** Starts dependencies first and stops modules before their repositories and database. */
export function createAppRuntime({
  eventBus,
  windowManager,
  laneControlRepository,
  laneTimerService,
  databaseManager,
  consoleForwarder,
  lifecycleEntries,
  eventForwardingRules,
}: Dependencies) {
  // === Core Event Forwarding Rules ===
  // PhaseChanged, TimerTick, and TimerExpired are cross-cutting events defined at the composition root.
  const coreEventRules: EventForwardingRule[] = [
    {
      eventType: 'PhaseChanged',
      channel: eventsContract.channels.phaseChanged,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as PhaseChanged;
        return {
          phase: e.phase,
          remainingTime: e.remainingTime,
        };
      },
    },
    {
      eventType: 'TimerTick',
      channel: eventsContract.channels.timerTick,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerTick;
        return {
          remainingTime: e.remainingTime,
          phase: e.phase,
        };
      },
    },
    {
      eventType: 'TimerExpired',
      channel: eventsContract.channels.timerExpired,
      extractPayload: (event: AnyDomainEvent) => {
        const e = event as TimerExpired;
        return {
          phase: e.phase,
        };
      },
    },
  ];

  // === Domain Event Forwarder ===
  const allEventForwardingRules = [...eventForwardingRules, ...coreEventRules];
  const domainEventForwarder = new DomainEventForwarder(eventBus, windowManager, allEventForwardingRules);

  // === Lifecycle ===
  const lifecycle = new AppLifecycle();

  // stopAll() reverses registration order, so register infrastructure dependencies first.
  // This keeps the database open until repositories complete their final flush.
  lifecycle.registerShutdownOnly('Database', () => {
    databaseManager.close();
  });
  lifecycle.registerShutdownOnly('LaneControlRepository', () => {
    laneControlRepository.close();
  });
  lifecycle.register({
    name: 'LaneTimerService',
    start: async () => laneTimerService.restoreActiveTimers(),
    stop: async () => laneTimerService.stopAllTimers(),
  });
  lifecycle.registerShutdownOnly('WindowManager', () => {
    return windowManager.closeAllBoardWindows();
  });
  lifecycle.register({
    name: 'DomainEventForwarder',
    start: async () => domainEventForwarder.start(),
    stop: async () => domainEventForwarder.stop(),
  });
  lifecycle.registerShutdownOnly('ConsoleForwarder', () => {
    consoleForwarder.stop();
  });

  // Modules stop before their infrastructure dependencies.
  for (const entry of lifecycleEntries) {
    lifecycle.register(entry);
  }

  return { lifecycle, domainEventForwarder };
}
