// SPDX-License-Identifier: MIT
import { AppUpdateStateSchema } from '@sasakiuri/saika-updater';
import { z } from 'zod';
import {
  command,
  commandDataResponseSchema,
  CommandResponseSchema,
  defineContract,
  query,
  queryResponseSchema,
} from '../defineContract';

export const updaterContract = defineContract('updater', {
  getUpdateState: query(z.void(), queryResponseSchema(AppUpdateStateSchema)),
  checkForUpdates: command(z.void(), commandDataResponseSchema(AppUpdateStateSchema)),
  quitAndInstall: command(z.void(), CommandResponseSchema),
});
