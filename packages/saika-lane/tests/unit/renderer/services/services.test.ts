// SPDX-License-Identifier: MIT
/**
 * Each service method is a createServiceMethod over one bridge method (createServiceMethod.test.ts covers the
 * response handling); this pins which bridge method each one forwards to. The settings save adapters are in
 * settingsService.test.ts.
 */
import { describe, expect, it, type Mock } from 'vitest';

import { competitionService } from '@/renderer/services/competitionService';
import { connectionService } from '@/renderer/services/connectionService';
import { mqttService } from '@/renderer/services/mqttService';
import { reportService } from '@/renderer/services/reportService';
import { sessionService } from '@/renderer/services/sessionService';
import { settingsService } from '@/renderer/services/settingsService';
import { startupService } from '@/renderer/services/startupService';
import { timedTargetService } from '@/renderer/services/timedTargetService';
import { updateService } from '@/renderer/services/updateService';
import { vistaService } from '@/renderer/services/vistaService';
import { windowService } from '@/renderer/services/windowService';

import { installMockElectronAPI, type MockedElectronAPI } from '../../../helpers/mockElectronAPI';

type ServiceMethod = (...args: unknown[]) => Promise<unknown>;
type Namespace = Exclude<keyof MockedElectronAPI, 'appVersion' | 'hasNativeWindowFrame'>;

/** Every method of `service` forwards to the bridge method of the same name in `namespace`. */
function sameNamed(
  serviceName: string,
  service: object,
  namespace: Namespace,
  except: readonly string[] = [],
): [string, Namespace, string, ServiceMethod][] {
  return Object.entries(service)
    .filter(([method]) => !except.includes(method))
    .map(([method, call]) => [`${serviceName}.${method}`, namespace, method, call as ServiceMethod]);
}

const SETTINGS_SAVE_ADAPTERS = [
  'savePrintSettings',
  'saveConnectionSettings',
  'saveUserPreferences',
  'saveAppSettings',
];

const cases = [
  ...sameNamed('competitionService', competitionService, 'competition'),
  ...sameNamed('connectionService', connectionService, 'usb'),
  ...sameNamed('mqttService', mqttService, 'mqtt'),
  ...sameNamed('reportService', reportService, 'report'),
  ...sameNamed('sessionService', { switchMode: sessionService.switchMode }, 'commands'),
  ...sameNamed(
    'sessionService',
    { getSessionScore: sessionService.getSessionScore, getShotHistory: sessionService.getShotHistory },
    'queries',
  ),
  ...sameNamed('settingsService', settingsService, 'settings', SETTINGS_SAVE_ADAPTERS),
  ...sameNamed('startupService', startupService, 'startup'),
  ...sameNamed('timedTargetService', timedTargetService, 'timedTarget'),
  ...sameNamed('updateService', updateService, 'updates'),
  ...sameNamed('vistaService', vistaService, 'vista'),
  ...sameNamed('windowService', windowService, 'window'),
];

describe('renderer services', () => {
  it('covers every session service method', () => {
    expect(cases.filter(([name]) => name.startsWith('sessionService.')).map(([name]) => name)).toEqual(
      Object.keys(sessionService).map((method) => `sessionService.${method}`),
    );
  });

  it.each(cases)(
    '%s forwards its arguments to %s.%s and returns the response data',
    async (_, namespace, method, call) => {
      const api = installMockElectronAPI();
      const bridgeMethod = (api[namespace] as Record<string, Mock>)[method]!;
      const input = { probe: true };
      const data = { result: true };
      bridgeMethod.mockResolvedValue({ success: true, data });

      await expect(call(input)).resolves.toBe(data);
      expect(bridgeMethod).toHaveBeenCalledExactlyOnceWith(input);
    },
  );
});
