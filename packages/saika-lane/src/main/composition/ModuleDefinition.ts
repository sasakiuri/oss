// SPDX-License-Identifier: MIT
/**
 * Module definition — Principle of Least Privilege
 *
 * Each module declares only the dependencies it needs and receives only those dependencies.
 */

import type Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { IMqttClientService } from '@/main/modules/mqtt/infra/IMqttClientService';
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
} from '@/main/modules/qualification-recovery';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IAppSettingsStore } from '@/main/modules/settings/infra/IAppSettingsStore';
import type { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import type { ITimedTargetControl } from '@/main/modules/timed-target';
import type { TimingProfileService } from '@/main/modules/timing-profiles';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** Flat record of all injectable services */
export interface ServiceRegistry {
  database: Database.Database;
  commandBus: CommandBus;
  queryBus: QueryBus;
  eventBus: IEventBus;
  ipcRouter: IpcRouter;
  storage: ILocalStorage;
  settingsStore: IAppSettingsStore;
  usbManager: IUSBConnectionManager;
  sessionRepository: ISessionRepository;
  connectionRepository: IConnectionRepository;
  competitionRepository: ICompetitionRepository;
  printWindowService: PrintWindowService;
  adapterRegistry: AdapterRegistry;
  mqttClient?: IMqttClientService;
  timerService: LaneTimerService;
  competitionInterruptionControl: ICompetitionInterruptionControl;
  competitionShootOffControl: ICompetitionShootOffControl;
  qualificationRecoveryControl: IQualificationRecoveryControl;
  qualificationRecoveryAdjudicationControl: IQualificationRecoveryAdjudicationControl;
  qualificationRecoverySettlementControl: IQualificationRecoverySettlementControl;
  safetyStopControl: ILaneSafetyStopControl;
  timedTargetControl: ITimedTargetControl;
  timingProfileService: TimingProfileService;
  mainWindow: BrowserWindow;
  userDataPath: string;
}

/** Module definition — declares deps, receives only those deps */
export interface ModuleDefinition<TDeps extends keyof ServiceRegistry = keyof ServiceRegistry> {
  readonly name: string;
  readonly deps: readonly TDeps[];
  register(ctx: Pick<ServiceRegistry, TDeps>): void;
}
