import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';

import type { PublishMqttResultsCommand, PublishResultsResponse } from './commands/PublishMqttResults';
import type { ConfirmResultsCommand } from './commands/ConfirmResults';
import type { ConfirmResultsResponse } from '@/shared/ipc/contracts';

// --- Command Tokens ---
export const PublishMqttResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttResults',
);
export const PublishMqttFinalResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttFinalResults',
);
export const PublishMqttMixedTeamFinalResultsToken = defineCommand<PublishMqttResultsCommand, PublishResultsResponse>(
  'PublishMqttMixedTeamFinalResults',
);
export const ConfirmResultsToken = defineCommand<ConfirmResultsCommand, ConfirmResultsResponse>('ConfirmResults');
