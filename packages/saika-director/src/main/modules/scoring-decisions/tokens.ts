import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import type {
  AddScoringDecisionPayload,
  RevokeScoringDecisionPayload,
  ScoringDecisionDto,
} from '@/shared/ipc/contracts';

export const AppendScoringDecisionToken = defineCommand<AddScoringDecisionPayload, ScoringDecisionDto>(
  'AppendScoringDecision',
);
export const RevokeScoringDecisionToken = defineCommand<RevokeScoringDecisionPayload, ScoringDecisionDto>(
  'RevokeScoringDecision',
);
