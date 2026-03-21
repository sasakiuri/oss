// SPDX-License-Identifier: MIT
/**
 * ModuleLoader — Dependency injection engine
 *
 * Injects only the declared dependencies of each module and calls register().
 */

import type { ModuleDefinition, ServiceRegistry } from '@/main/composition/ModuleDefinition';
import { getLogger } from '@/main/shared-infra/logging/createLogger';

export class ModuleLoader {
  load(modules: readonly ModuleDefinition[], registry: ServiceRegistry): void {
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
