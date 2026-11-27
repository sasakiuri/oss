import { RefreshCw, ShieldCheck } from 'lucide-react';

import type { ParticipantDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { EquipmentCheckCard } from './EquipmentCheckCard';
import { SelectionForm } from './EquipmentControlForms';
import { usePostCompetitionEquipmentChecks } from './usePostCompetitionEquipmentChecks';

interface Props {
  championshipId: string;
  eventId: string;
  participants: ParticipantDto[];
}

export function PostCompetitionEquipmentControlPanel({ championshipId, eventId, participants }: Props) {
  const { checks, busy, error, notice, load, commands } = usePostCompetitionEquipmentChecks(championshipId, eventId);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldCheck size={16} aria-hidden="true" /> Post-competition equipment control
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-vscode-text-muted">
            Append-only selection, written notice, test and confirmation evidence under ISSF 6.7.9. This workspace
            records the check; it never applies a DSQ automatically.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError>{error}</InlineError>}
      {notice && <p className="border-l-2 border-vscode-success pl-3 text-xs text-vscode-success">{notice}</p>}

      <SelectionForm
        championshipId={championshipId}
        eventId={eventId}
        participants={participants}
        checks={checks}
        disabled={busy}
        onSelect={commands.select}
      />

      {checks.length === 0 ? (
        <p className="border-y border-vscode-border py-5 text-center text-xs text-vscode-text-muted">
          No post-competition equipment checks have been selected for this event.
        </p>
      ) : (
        <div className="space-y-3">
          {checks.map((check) => (
            <EquipmentCheckCard key={check.id} check={check} disabled={busy} commands={commands} />
          ))}
        </div>
      )}
    </div>
  );
}
