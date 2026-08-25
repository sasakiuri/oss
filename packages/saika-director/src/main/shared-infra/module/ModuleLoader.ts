/**
 * ModuleLoader.ts
 *
 * Iterates a static list of ModuleDefinitions and calls register() on each,
 * creating a dependency-subset context per module and collecting ModuleOutput.
 */

import type {
  ModuleDefinition,
  ServiceRegistry,
  LifecycleEntry,
  EventForwardingRule,
  TransformerForwardingRule,
} from './ModuleDefinition';
import { Logger } from '@/shared/utils/Logger';

const logger = Logger.create('ModuleLoader');

export interface ModuleLoadResult {
  readonly lifecycleEntries: LifecycleEntry[];
  readonly eventForwardingRules: (EventForwardingRule | TransformerForwardingRule)[];
}

export class ModuleLoader {
  load(modules: readonly ModuleDefinition[], registry: ServiceRegistry): ModuleLoadResult {
    const lifecycleEntries: LifecycleEntry[] = [];
    const eventForwardingRules: (EventForwardingRule | TransformerForwardingRule)[] = [];

    for (const mod of modules) {
      logger.info(`Loading module: ${mod.name}`);

      // Create subset context with only declared deps
      const ctx = {} as Record<string, unknown>;
      for (const dep of mod.deps) {
        ctx[dep] = registry[dep];
      }

      const output = mod.register(ctx as Pick<ServiceRegistry, keyof ServiceRegistry>);
      if (output) {
        if (output.lifecycle) lifecycleEntries.push(...output.lifecycle);
        if (output.eventForwarding) eventForwardingRules.push(...output.eventForwarding);
      }
    }

    return { lifecycleEntries, eventForwardingRules };
  }
}
