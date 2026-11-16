import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Music, RefreshCw } from 'lucide-react';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { productionOperationsService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { ProductionOperationAssessmentDto, RecordProductionOperationPayload } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';
import { mutedLabelClass, smallBlockInputClass } from '@/renderer/presentation/features/shared/common/formClasses';
import { InlineError } from '../shared/common/InlineError';

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
  const { busy, error, setError, run } = useAsyncAction();

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
    await run(async () => {
      const response = await productionOperationsService.record({
        ...props,
        action,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      unwrap(response);
      await load();
    });
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
      {error && <InlineError>{error}</InlineError>}
      <div className="grid gap-2 md:grid-cols-2">
        <label className={mutedLabelClass}>
          Official / sound technician
          <input
            className={smallBlockInputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
        <label className={mutedLabelClass}>
          Audit statement
          <input
            className={smallBlockInputClass}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
          />
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
