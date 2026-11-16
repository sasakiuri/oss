// SPDX-License-Identifier: MIT
import type { TimedTargetStateDto } from '@sasakiuri/saika-protocol/TimedTargetState';

import type { TimedTargetState } from './domain/ITimedTargetControl';

export function toTimedTargetStateDto(state: TimedTargetState): TimedTargetStateDto {
  return {
    ...state,
    loadAt: state.loadAt.toISOString(),
    attentionAt: state.attentionAt.toISOString(),
    completesAt: state.completesAt.toISOString(),
    nextLoadAllowedAt: state.nextLoadAllowedAt.toISOString(),
    nextTransitionAt: state.nextTransitionAt?.toISOString() ?? null,
  };
}
