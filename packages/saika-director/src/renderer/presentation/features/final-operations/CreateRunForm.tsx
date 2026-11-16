// SPDX-License-Identifier: MIT
import { Button } from '../shared/common/Button';

import { TextField } from './TextField';
import type { FinalOperationRunState } from './useFinalOperationRun';

type CreateRunState = Pick<
  FinalOperationRunState,
  'saving' | 'scheduledStart' | 'setScheduledStart' | 'officialName' | 'setOfficialName' | 'createRun'
>;

interface CreateRunFormProps {
  readonly state: CreateRunState;
  readonly disabled: boolean;
}

/** Creates the competition's command run from its published start. */
export function CreateRunForm({ state, disabled }: CreateRunFormProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextField
        label="Published start"
        type="datetime-local"
        value={state.scheduledStart}
        onChange={state.setScheduledStart}
      />
      <TextField label="Official name" value={state.officialName} onChange={state.setOfficialName} />
      <Button
        className="md:col-span-2 md:w-fit"
        disabled={disabled || state.saving || !state.scheduledStart || !state.officialName.trim()}
        onClick={() => void state.createRun()}
      >
        Create command run
      </Button>
    </div>
  );
}
