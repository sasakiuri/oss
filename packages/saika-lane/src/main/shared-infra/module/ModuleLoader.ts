// SPDX-License-Identifier: MIT
/** Registers modules with the dependencies declared in their definitions. */

import type { ModuleDefinition, ServiceRegistry } from '@/main/composition/ModuleDefinition';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export class ModuleLoader {
  load(modules: readonly ModuleDefinition[], registry: ServiceRegistry): void {
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

    for (const mod of modules) {
      const ctx = {} as Record<keyof ServiceRegistry, ServiceRegistry[keyof ServiceRegistry]>;
      for (const dep of mod.deps) {
        ctx[dep] = registry[dep];
      }
      mod.register(ctx as ServiceRegistry);
      getLogger().debug(`Module "${mod.name}" loaded`, 'module');
    }
  }
}
