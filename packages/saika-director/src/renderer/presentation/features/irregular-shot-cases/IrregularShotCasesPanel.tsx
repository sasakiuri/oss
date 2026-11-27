import { useMemo } from 'react';
import { Crosshair, RefreshCw } from 'lucide-react';
import type { FinalSeriesAdjudicationCapability } from '@sasakiuri/saika-rules';

import type { ResultScope } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateIrregularShotCaseForm } from './CreateIrregularShotCaseForm';
import { IrregularShotCaseCard } from './IrregularShotCaseCard';
import { useIrregularShotCases } from './useIrregularShotCases';

interface Props {
  eventId: string;
  competitionId: string;
  resultScope: ResultScope;
  lanes: readonly { laneId: string; label: string }[];
  adjudication?: FinalSeriesAdjudicationCapability;
  disabled?: boolean;
}

export function IrregularShotCasesPanel({
  eventId,
  competitionId,
  resultScope,
  lanes,
  adjudication,
  disabled = false,
}: Props) {
  const { cases, reports, decisions, loading, saving, error, load, commands } = useIrregularShotCases({
    eventId,
    competitionId,
    resultScope,
  });

  const laneLabels = useMemo(() => new Map(lanes.map((lane) => [lane.laneId, lane.label])), [lanes]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Crosshair size={17} aria-hidden="true" />
            <h2 className="text-sm font-semibold text-vscode-text">Irregular shot cases</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Evidence workspace for irregular shots and optional RulePack-defined Final incidents. Detection and evidence
            never apply a score decision automatically.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError as="div">{error}</InlineError>}

      <CreateIrregularShotCaseForm
        lanes={lanes}
        adjudication={adjudication}
        disabled={disabled}
        saving={saving}
        onCreate={commands.create}
      />

      {!loading && cases.length === 0 && (
        <p className="text-xs text-vscode-text-muted">No cases for this competition.</p>
      )}
      {cases.map((value) => (
        <IrregularShotCaseCard
          key={value.id}
          value={value}
          reports={reports}
          decisions={decisions}
          laneLabels={laneLabels}
          disabled={disabled}
          commands={commands}
        />
      ))}
    </div>
  );
}
