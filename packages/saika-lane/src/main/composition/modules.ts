// SPDX-License-Identifier: MIT
import { competitionModule } from '@/main/modules/competition/competition.module';
import { connectionModule } from '@/main/modules/connection/connection.module';
import { mqttModule } from '@/main/modules/mqtt/mqtt.module';
import { reportModule } from '@/main/modules/report/report.module';
import { sessionModule } from '@/main/modules/session/session.module';
import { settingsModule } from '@/main/modules/settings/settings.module';
import { targetModule } from '@/main/modules/target/target.module';
import { timedTargetModule } from '@/main/modules/timed-target';

import type { ModuleDefinition } from './ModuleDefinition';

/** Registration order is explicit because modules install handlers consumed by later modules. */
export const laneModules = [
  targetModule,
  sessionModule,
  timedTargetModule,
  connectionModule,
  settingsModule,
  competitionModule,
  reportModule,
  mqttModule,
] satisfies readonly ModuleDefinition[];
