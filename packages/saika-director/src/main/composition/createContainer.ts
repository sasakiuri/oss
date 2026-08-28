/**
 * createContainer.ts
 *
 * Application dependency factory.
 *
 * Centralizes all dependency construction in the composition root.
 */

import { app } from 'electron';
import { join } from 'path';

import { championshipModule } from '@/main/modules/championship';
import { laneControlModule } from '@/main/modules/lane-control';
import {
  FinalResultsReader,
  QualificationResultsReader,
  resultsModule,
  ScoringDecisionTargetResolver,
  SqliteFinalResultRepository,
  SqliteResultRepository,
} from '@/main/modules/results';
import { scoringDecisionsModule, SqliteScoringDecisionRepository } from '@/main/modules/scoring-decisions';
import { shootoffModule } from '@/main/modules/shootoff';
import { boardModule } from '@/main/modules/board';
import { mqttModule, SqliteCompetitionShotJournal } from '@/main/modules/mqtt';
import { resultVerificationModule, SqliteResultVerificationRepository } from '@/main/modules/result-verification';
import { incidentReportsModule, SqliteRangeIncidentReportRepository } from '@/main/modules/incident-reports';
import {
  finalPlacementReviewModule,
  SqliteFinalPlacementReviewRepository,
} from '@/main/modules/final-placement-review';

// Infrastructure
import { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import { DebugLogStore } from '@/main/infrastructure/logging/Logger';
import { ConsoleForwarder } from '@/main/infrastructure/logging/ConsoleForwarder';
import { WindowManager } from '@/main/infrastructure/window/WindowManager';
import { DatabaseManager } from '@/main/infrastructure/database/DatabaseManager';
import { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import { SqliteLaneControlRepository } from '@/main/modules/lane-control';
import { LaneTimerService } from '@/main/modules/lane-control';
import { DomainEventForwarder } from '@/main/shared-infra/ipc/DomainEventForwarder';
import { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import { AppLifecycle } from '@/main/shared-infra/lifecycle/AppLifecycle';
import { ModuleLoader } from '@/main/shared-infra/module/ModuleLoader';
import type { ServiceRegistry } from '@/main/shared-infra/module/ModuleDefinition';

// Application Layer (type-safe CQRS buses)
import { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import {
  CommandLoggingMiddleware,
  QueryLoggingMiddleware,
} from '@/main/shared-infra/cqrs/middleware/LoggingMiddleware';

import { competitionTypeRegistry } from '@/shared/competitionTypes/CompetitionTypeRegistry';
import { registerBuiltinCompetitionTypes } from '@/shared/competitionTypes/registerBuiltinCompetitionTypes';
import { eventsContract } from '@/shared/ipc/contracts';
import type { EventForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';
import type { PhaseChanged, TimerTick, TimerExpired } from '@/main/shared-infra/events/coreEvents';
import type { AnyDomainEvent } from '@/main/shared-infra/events/EventBus';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('createApp');

// Static module list (Vite/Electron safe — no dynamic import)
const modules = [
  championshipModule,
  laneControlModule,
  scoringDecisionsModule,
  resultsModule,
  shootoffModule,
  boardModule,
  mqttModule,
  resultVerificationModule,
  incidentReportsModule,
  finalPlacementReviewModule,
];

/**
 * Services exposed to main.ts.
 */
export interface AppServices {
  readonly windowManager: WindowManager;
  readonly domainEventForwarder: DomainEventForwarder;
  readonly lifecycle: AppLifecycle;
  readonly laneTimerService: LaneTimerService;
  readonly databaseManager: DatabaseManager;
  readonly appConfigService: AppConfigService;
}

/** Prevents duplicate side effects from double initialization. */
let initialized = false;

/**
 * Constructs the application.
 *
 * This function is not idempotent and cannot be called twice.
 *
 * @param preloadPath Absolute path to the preload script.
 * @returns AppServices instance.
 * @throws When called more than once.
 */
export function createApp(preloadPath: string): AppServices {
  if (initialized) {
    const msg =
      'createApp() has already been called. Double initialization is not allowed because it causes duplicate side effects (console hooks, IPC handlers, event listeners).';
    logger.logError(msg, new Error(msg));
    throw new Error(msg);
  }
  initialized = true;

  // === Core Infrastructure ===
  const eventBus = new TypedEventBus();

  // Logging
  const debugLogStore = new DebugLogStore();
  const consoleForwarder = new ConsoleForwarder(eventBus);
  consoleForwarder.start();

  // Database
  const dbPath = join(app.getPath('userData'), 'saika.db');
  const databaseManager = new DatabaseManager(dbPath);
  const database = databaseManager.getDatabase();

  // Repositories
  const appConfigService = new AppConfigService(database);
  const laneControlRepository = new SqliteLaneControlRepository(database);
  const resultRepository = new SqliteResultRepository(database);
  const finalResultRepository = new SqliteFinalResultRepository(database);
  const scoringDecisionRepository = new SqliteScoringDecisionRepository(database);
  const competitionShotJournal = new SqliteCompetitionShotJournal(database);
  const resultVerificationRepository = new SqliteResultVerificationRepository(database);
  const rangeIncidentReportRepository = new SqliteRangeIncidentReportRepository(database);
  const finalPlacementReviewRepository = new SqliteFinalPlacementReviewRepository(database);

  // Competition Type Registry
  registerBuiltinCompetitionTypes();

  // Window Manager
  const windowManager = new WindowManager(preloadPath);

  // CQRS
  const commandBus = new CommandBus();
  commandBus.use(new CommandLoggingMiddleware());
  const queryBus = new QueryBus();
  queryBus.use(new QueryLoggingMiddleware());

  const qualificationResultsReader = new QualificationResultsReader(
    queryBus,
    resultRepository,
    scoringDecisionRepository,
    competitionTypeRegistry,
  );
  const finalResultsReader = new FinalResultsReader(
    queryBus,
    finalResultRepository,
    scoringDecisionRepository,
    finalPlacementReviewRepository,
    competitionTypeRegistry,
  );
  const scoringDecisionTargetResolver = new ScoringDecisionTargetResolver(
    queryBus,
    resultRepository,
    finalResultRepository,
    competitionTypeRegistry,
  );

  // IPC Router
  const ipcRouter = new IpcRouter();

  // Timer Service
  const laneTimerService = new LaneTimerService(laneControlRepository, eventBus);

  // === Build ServiceRegistry ===
  const registry: ServiceRegistry = {
    database,
    eventBus,
    commandBus,
    queryBus,
    ipcRouter,
    windowManager,
    debugLogStore,
    laneControlRepository,
    laneTimerService,
    appConfigService,
    competitionTypeRegistry,
    resultRepository,
    finalResultRepository,
    scoringDecisionRepository,
    scoringDecisionTargetResolver,
    competitionShotJournal,
    qualificationResultsReader,
    finalResultsReader,
    resultVerificationRepository,
    rangeIncidentReportRepository,
    finalPlacementReviewRepository,
  };

  // === Module Registration via ModuleLoader ===
  const moduleLoader = new ModuleLoader();
  const { lifecycleEntries, eventForwardingRules } = moduleLoader.load(modules, registry);

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
    windowManager.closeAllBoardWindows();
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

  return {
    windowManager,
    domainEventForwarder,
    lifecycle,
    laneTimerService,
    databaseManager,
    appConfigService,
  };
}

/**
 * Resets the initialization flag for tests.
 */
export function resetAppInitialization(): void {
  initialized = false;
}
