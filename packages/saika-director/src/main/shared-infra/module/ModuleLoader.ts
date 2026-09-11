/** Registers the static module catalog and collects module outputs. */

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
    // Validate the entire catalog before any module installs handlers or listeners.
    const names = new Set<string>();
    for (const mod of modules) {
      if (names.has(mod.name)) throw new Error(`Duplicate module name: "${mod.name}"`);
      names.add(mod.name);
      for (const dep of mod.deps) {
        if (!Object.hasOwn(registry, dep) || registry[dep] === undefined) {
          throw new Error(`Module "${mod.name}" requires service "${dep}"`);
        }
      }
    }

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
