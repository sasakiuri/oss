import type { ModuleDefinition } from '@/main/shared-infra/module/ModuleDefinition';
import { relayAthleteLifecycleContract } from '@/shared/ipc/contracts';

import { RelayAthleteLifecycleService } from './application/RelayAthleteLifecycleService';
import { IssfRelayAthleteLifecyclePolicy, type RelayAthleteLifecycleMode } from './domain/RelayAthleteLifecyclePolicy';
import { SqliteRelayAthleteLifecycleRepository } from './infra/SqliteRelayAthleteLifecycleRepository';

export const relayAthleteLifecycleModule: ModuleDefinition<'database' | 'ipcRouter'> = {
  name: 'relayAthleteLifecycle',
  deps: ['database', 'ipcRouter'] as const,
  register({ database, ipcRouter }) {
    const mode = lifecycleMode(process.env.SAIKA_RELAY_ATHLETE_LIFECYCLE_MODE);
    const service = new RelayAthleteLifecycleService(
      new SqliteRelayAthleteLifecycleRepository(database),
      new IssfRelayAthleteLifecyclePolicy(mode),
    );
    ipcRouter.register(relayAthleteLifecycleContract, {
      list: (input) => service.list(input),
      record: (input) => service.record(input),
      assess: (input) => service.assess(input),
    });
  },
};

function lifecycleMode(value: string | undefined): RelayAthleteLifecycleMode {
  return value === 'DISABLED' || value === 'REQUIRED' ? value : 'ADVISORY';
}
