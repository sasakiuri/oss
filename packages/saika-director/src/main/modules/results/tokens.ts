import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';

import type { PublishResultsCommand } from './commands/PublishResults';
import type { PublishMqttResultsCommand } from './commands/PublishMqttResults';
import type { PublishFinalResultsCommand } from './commands/PublishFinalResults';
import type { ConfirmResultsCommand } from './commands/ConfirmResults';
import type { PublishResultsResponse } from '@/shared/ipc/contracts/results.contract';

// --- Command Tokens ---
export const PublishResultsToken = defineCommand<PublishResultsCommand, unknown>('PublishResults');
export const PublishMqttResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttResults',
);
export const PublishMqttFinalResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttFinalResults',
);
export const PublishMqttMixedTeamFinalResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttMixedTeamFinalResults',
);
export const PublishFinalResultsToken = defineCommand<PublishFinalResultsCommand, unknown>('PublishFinalResults');
export const ConfirmResultsToken = defineCommand<ConfirmResultsCommand, unknown>('ConfirmResults');
