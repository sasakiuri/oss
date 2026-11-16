// SPDX-License-Identifier: MIT
/** Each module receives only the services declared in its deps array. */

import type Database from 'better-sqlite3';
import type { BrowserWindow } from 'electron';

import type {
  ICompetitionCatalog,
  ICompetitionRepository,
} from '@/main/modules/competition/domain/ICompetitionRepository';
import type { ICompetitionTimer } from '@/main/modules/competition/domain/ICompetitionTimer';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl, ICompetitionShootOffShotOutbox } from '@/main/modules/competition-shoot-off';
import type { IConnectionRepository } from '@/main/modules/connection/domain/IConnectionRepository';
import type { SessionContextCache } from '@/main/modules/connection/infra/SessionContextCache';
import type { IUSBConnectionManager } from '@/main/modules/connection/infra/usb/IUSBConnectionManager';
import type { EstComplaintSignalService } from '@/main/modules/est-complaint-signal';
import type { DirectorMembership } from '@/main/modules/mqtt/application/DirectorMembership';
import type { IMqttClientService } from '@/main/modules/mqtt/domain/IMqttClientService';
import type { QualificationMalfunctionSignalService } from '@/main/modules/qualification-malfunction-signal';
import type {
  IQualificationRecoveryAdjudicationControl,
  IQualificationRecoveryControl,
  IQualificationRecoverySettlementControl,
  IQualificationRecoveryShotOutbox,
} from '@/main/modules/qualification-recovery';
import type { RangeOfficerRequestService } from '@/main/modules/range-officer-request';
import type { PrintWindowService } from '@/main/modules/report/infra/PrintWindowService';
import type { IReserveLaneTransferJournal } from '@/main/modules/reserve-lane-transfer/domain/ReserveLaneTransfer';
import type { ILaneSafetyStopControl } from '@/main/modules/safety-stop';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { IAppSettingsStore } from '@/main/modules/settings/application/IAppSettingsStore';
import type { IShotObservationEvidenceOutbox } from '@/main/modules/shot-observation/domain/IShotObservationEvidenceOutbox';
import type { AdapterRegistry } from '@/main/modules/target/infra/AdapterRegistry';
import type { ITimedTargetControl, ITimedTargetSequenceRepository } from '@/main/modules/timed-target';
import type { TimingProfileService } from '@/main/modules/timing-profiles';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { ActiveRunStartup } from '@/main/startup/restoreActiveRun';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

/** Flat record of all injectable services */
export interface ServiceRegistry {
  database: Database.Database;
  commandBus: CommandBus;
  queryBus: QueryBus;
  eventBus: IEventBus;
  ipcRouter: IpcRouter;
  storage: ILocalStorage;
  membership: DirectorMembership;
  sessionContextCache: SessionContextCache;
  startup: ActiveRunStartup;
  settingsStore: IAppSettingsStore;
  usbManager: IUSBConnectionManager;
  sessionRepository: ISessionRepository;
  connectionRepository: IConnectionRepository;
  competitionRepository: ICompetitionRepository;
  /** The competition store's read-only enumeration; the same instance as competitionRepository. */
  competitionCatalog: ICompetitionCatalog;
  printWindowService: PrintWindowService;
  adapterRegistry: AdapterRegistry;
  mqttClient?: IMqttClientService;
  timerService: ICompetitionTimer;
  competitionInterruptionControl: ICompetitionInterruptionControl;
  competitionShootOffControl: ICompetitionShootOffControl;
  qualificationRecoveryControl: IQualificationRecoveryControl;
  qualificationRecoveryAdjudicationControl: IQualificationRecoveryAdjudicationControl;
  qualificationRecoverySettlementControl: IQualificationRecoverySettlementControl;
  safetyStopControl: ILaneSafetyStopControl;
  reserveTransferJournal: IReserveLaneTransferJournal;
  rangeOfficerRequestService: RangeOfficerRequestService;
  qualificationMalfunctionSignalService: QualificationMalfunctionSignalService;
  estComplaintSignalService: EstComplaintSignalService;
  timedTargetControl: ITimedTargetControl;
  timedTargetSequenceRepository: ITimedTargetSequenceRepository;
  qualificationRecoveryShotOutbox: IQualificationRecoveryShotOutbox;
  competitionShootOffShotOutbox: ICompetitionShootOffShotOutbox;
  shotObservationEvidenceOutbox: IShotObservationEvidenceOutbox;
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
