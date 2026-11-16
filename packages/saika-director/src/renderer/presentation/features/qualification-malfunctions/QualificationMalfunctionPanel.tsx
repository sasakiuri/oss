import { RefreshCw, Wrench } from 'lucide-react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

import { CaseListItem } from '../shared/cases/CaseListItem';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateMalfunctionForm } from './CreateMalfunctionForm';
import { MalfunctionDetail } from './MalfunctionDetail';
import { useQualificationMalfunctionCases } from './useQualificationMalfunctionCases';

interface QualificationMalfunctionPanelProps {
  readonly competitionId: string;
  readonly eventId: string;
  readonly relayNumber: number;
  readonly lanes: readonly DirectorLaneSnapshotDto[];
  readonly supportsExceptionalMatchParts: boolean;
  readonly disabled?: boolean;
}

export function QualificationMalfunctionPanel({
  competitionId,
  eventId,
  relayNumber,
  lanes,
  supportsExceptionalMatchParts,
  disabled = false,
}: QualificationMalfunctionPanelProps) {
  const {
    cases,
    selectedId,
    setSelectedId,
    selected,
    linkedSignalIds,
    loading,
    saving,
    error,
    load,
    replaceCase,
    commands,
  } = useQualificationMalfunctionCases(competitionId);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wrench size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Qualification malfunction cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Record each step: claim, inspection, ruling, authorized remedy, recovery, and score settlement. Recording a
            case does not send a firing command to a Lane.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError>{error}</InlineError>}

      <CreateMalfunctionForm
        competitionId={competitionId}
        eventId={eventId}
        relayNumber={relayNumber}
        lanes={lanes}
        linkedSignalIds={linkedSignalIds}
        supportsExceptionalMatchParts={supportsExceptionalMatchParts}
        disabled={disabled || loading || saving}
        onCreate={commands.create}
      />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && (
            <p className="p-3 text-xs text-vscode-text-muted">No malfunction cases.</p>
          )}
          {cases.map((value) => (
            <CaseListItem key={value.id} selected={value.id === selectedId} onSelect={() => setSelectedId(value.id)}>
              <span className="block text-[13px] font-medium text-vscode-text">
                FP {value.laneChannelSnapshot} · {value.participantNameSnapshot}
              </span>
              <span className="mt-0.5 block truncate text-xs text-vscode-text-muted">
                {sentenceCaseLabel(value.status)} · {sentenceCaseLabel(value.claimMode)} · {value.summary}
              </span>
            </CaseListItem>
          ))}
        </div>

        {selected && (
          <MalfunctionDetail
            key={selected.id}
            value={selected}
            disabled={disabled || saving}
            onAppend={commands.appendEntry}
            onChanged={replaceCase}
          />
        )}
      </div>
    </div>
  );
}
