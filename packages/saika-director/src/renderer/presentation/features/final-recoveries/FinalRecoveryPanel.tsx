import { RefreshCw, ShieldAlert } from 'lucide-react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';
import type { CompetitionPhase } from '@sasakiuri/saika-protocol/CompetitionState';

import { CaseListItem } from '../shared/cases/CaseListItem';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateRecoveryForm } from './CreateRecoveryForm';
import { RecoveryDetail } from './RecoveryDetail';
import { useFinalRecoveryCases } from './useFinalRecoveryCases';

interface FinalRecoveryPanelProps {
  competitionId: string;
  competitionTypeId?: string;
  phase: CompetitionPhase;
  lanes: readonly DirectorLaneSnapshotDto[];
  eventId?: string;
  disabled?: boolean;
}

export function FinalRecoveryPanel({
  competitionId,
  competitionTypeId,
  phase,
  lanes,
  eventId,
  disabled = false,
}: FinalRecoveryPanelProps) {
  const { cases, run, selectedId, setSelectedId, selected, loading, saving, error, load, commands } =
    useFinalRecoveryCases(competitionId);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Final recovery cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Record Jury rulings and resumption conditions here. Use the separate controls for STOP, target examinations,
            scoring decisions, and incident reports.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError>{error}</InlineError>}

      <CreateRecoveryForm
        competitionId={competitionId}
        competitionTypeId={competitionTypeId}
        eventId={eventId}
        phase={phase}
        lanes={lanes}
        run={run}
        disabled={disabled || saving}
        onCreate={commands.create}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No recovery cases.</p>}
          {cases.map((value) => (
            <CaseListItem key={value.id} selected={value.id === selectedId} onSelect={() => setSelectedId(value.id)}>
              <span className="block text-[13px] font-medium text-vscode-text">
                {sentenceCaseLabel(value.incidentType)} · {sentenceCaseLabel(value.phase)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                {value.status} · {value.summary}
              </span>
            </CaseListItem>
          ))}
        </div>

        {selected && (
          <RecoveryDetail
            key={selected.id}
            value={selected}
            lanes={lanes}
            disabled={disabled || saving}
            onBindAllowanceSubject={commands.bindAllowanceSubject}
            onAppend={commands.appendEntry}
          />
        )}
      </div>
    </div>
  );
}
