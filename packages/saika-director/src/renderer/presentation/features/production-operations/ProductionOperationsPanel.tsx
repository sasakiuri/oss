import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Music, RefreshCw } from 'lucide-react';

import { productionOperationsService } from '@/renderer/services';
import type { ProductionOperationAssessmentDto, RecordProductionOperationPayload } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

interface ProductionOperationsPanelProps {
  competitionId: string;
  competitionTypeId: string;
  roundName: string;
  phase: string;
}

export function ProductionOperationsPanel(props: ProductionOperationsPanelProps) {
  const [assessment, setAssessment] = useState<ProductionOperationAssessmentDto | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('External sound and production system checked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await productionOperationsService.assess(props);
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setAssessment(response.data);
  }, [props.competitionId, props.competitionTypeId, props.phase, props.roundName]);

  useEffect(() => {
    void load();
  }, [load]);

  const record = async (action: RecordProductionOperationPayload['action']) => {
    setBusy(true);
    setError(null);
    try {
      const response = await productionOperationsService.record({
        ...props,
        action,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const enabled = Boolean(officialName.trim() && statement.trim() && !busy);
  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <Music size={16} aria-hidden="true" /> Music and production
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            External-system operational ledger · policy {assessment?.mode ?? '…'} ·{' '}
            {assessment?.ready ? 'ready' : 'action advised'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      <div className="grid gap-2 md:grid-cols-2">
        <label className={labelClass}>
          Official / sound technician
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Audit statement
          <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={assessment?.musicPlaying ? 'secondary' : 'primary'}
          disabled={!enabled}
          onClick={() => void record(assessment?.musicPlaying ? 'MUSIC_STOPPED' : 'MUSIC_STARTED')}
        >
          {assessment?.musicPlaying ? 'Record music stopped' : 'Record music started'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!enabled}
          onClick={() =>
            void record(assessment?.musicProgramApproved ? 'MUSIC_PROGRAM_APPROVAL_REVOKED' : 'MUSIC_PROGRAM_APPROVED')
          }
        >
          {assessment?.musicProgramApproved ? 'Revoke music approval' : 'TD approve music programme'}
        </Button>
        {props.roundName === 'Final' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!enabled}
            onClick={() =>
              void record(
                assessment?.finalProductionConfirmed ? 'FINAL_PRODUCTION_REVOKED' : 'FINAL_PRODUCTION_CONFIRMED',
              )
            }
          >
            {assessment?.finalProductionConfirmed ? 'Revoke production check' : 'Confirm Final production'}
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={!enabled} onClick={() => void record('ANNOUNCEMENT_NOTE')}>
          <Megaphone size={13} aria-hidden="true" /> Record announcement note
        </Button>
      </div>
      {assessment && (
        <div className="text-xs text-vscode-text-muted">
          <p>{assessment.ruleReferences.join(' · ')}</p>
          {assessment.guidance.map((item) => (
            <p key={item} className="mt-1 text-vscode-warning">
              {item}
            </p>
          ))}
          {assessment.mode === 'ADVISORY' && !assessment.ready && (
            <p className="mt-1">Advisory mode records the gap without blocking Lane commands.</p>
          )}
        </div>
      )}
    </div>
  );
}

const labelClass = 'text-xs text-vscode-text-muted';
const inputClass =
  'mt-1 block min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
