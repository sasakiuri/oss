// SPDX-License-Identifier: MIT
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';
import type { ModuleLoadResult } from '@/main/shared-infra/module/ModuleLoader';
import type { CompetitionServices } from './createCompetitionServices';

type Dependencies = Pick<ServiceRegistry, 'eventBus' | 'windowManager' | 'laneTimerService'> &
  Pick<CompetitionServices, 'laneControlRepository'> &
  ModuleLoadResult & { databaseManager: DatabaseManager };

/** Starts dependencies first and stops modules before their repositories and database. */
export function createAppRuntime({
  eventBus,
  windowManager,
  laneControlRepository,
  laneTimerService,
  databaseManager,
  lifecycleEntries,
  eventForwardingRules,
}: Dependencies) {
  // === Domain Event Forwarder ===
  const domainEventForwarder = new DomainEventForwarder(eventBus, windowManager, eventForwardingRules);

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

  // Modules stop before their infrastructure dependencies.
  for (const entry of lifecycleEntries) {
    lifecycle.register(entry);
  }

  return { lifecycle, domainEventForwarder };
}
