/**
 * ModuleDefinition.ts
 *
 * ServiceRegistry + Generic ModuleDefinition + ModuleOutput
 *
 * Each module declares its dependencies via a `deps` array (subset of
 * ServiceRegistry keys). The ModuleLoader injects only the declared
 * subset, enforcing the principle of least privilege at the type level.
 */

import type Database from 'better-sqlite3';
import type { TypedEventBus } from '@/main/shared-infra/events/TypedEventBus';
import type { CommandBus } from '@/main/shared-infra/cqrs/CommandBus';
import type { QueryBus } from '@/main/shared-infra/cqrs/QueryBus';
import type { IpcRouter } from '@/main/shared-infra/ipc/IpcRouter';
import type { WindowManager } from '@/main/infrastructure/window/WindowManager';
import type { IDebugLogStore } from '@/main/infrastructure/logging/Logger';
import type { ILaneControlRepository } from '@/main/modules/lane-control';
import type { LaneTimerService } from '@/main/modules/lane-control';
import type { AppConfigService } from '@/main/infrastructure/config/AppConfigService';
import type { CompetitionTypeRegistry } from '@/shared/competitionTypes';
import type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';

// Re-export for convenience
export type { EventForwardingRule, TransformerForwardingRule } from '@/main/shared-infra/ipc/EventForwardingRule';

// ---------------------------------------------------------------------------
// ServiceRegistry — single flat record of all injectable services
// ---------------------------------------------------------------------------

export interface ServiceRegistry {
  readonly database: Database.Database;
  readonly eventBus: TypedEventBus;
  readonly commandBus: CommandBus;
  readonly queryBus: QueryBus;
  readonly ipcRouter: IpcRouter;
  readonly windowManager: WindowManager;
  readonly debugLogStore: IDebugLogStore;
  readonly laneControlRepository: ILaneControlRepository;
  readonly laneTimerService: LaneTimerService;
  readonly appConfigService: AppConfigService;
  readonly competitionTypeRegistry: CompetitionTypeRegistry;
}

// ---------------------------------------------------------------------------
// ModuleOutput — what a module can return from register()
// ---------------------------------------------------------------------------

export interface LifecycleEntry {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ModuleOutput {
  lifecycle?: LifecycleEntry[];
  eventForwarding?: (EventForwardingRule | TransformerForwardingRule)[];
}

// ---------------------------------------------------------------------------
// ModuleDefinition — generic, deps-driven
// ---------------------------------------------------------------------------

export interface ModuleDefinition<TDeps extends keyof ServiceRegistry = keyof ServiceRegistry> {
  readonly name: string;
  readonly deps: readonly TDeps[];
  register(ctx: Pick<ServiceRegistry, TDeps>): ModuleOutput | void;
}
