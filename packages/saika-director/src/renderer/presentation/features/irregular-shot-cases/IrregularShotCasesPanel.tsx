import { useCallback, useEffect, useMemo, useState } from 'react';
import { Crosshair, RefreshCw } from 'lucide-react';
import type { FinalSeriesAdjudicationCapability } from '@sasakiuri/saika-rules';

import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { incidentReportsService, irregularShotCasesService, scoringDecisionsService } from '@/renderer/services';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { IrregularShotCaseDto, RangeIncidentReportDto, ScoringDecisionDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { CreateIrregularShotCaseForm } from './CreateIrregularShotCaseForm';
import { IrregularShotCaseCard } from './IrregularShotCaseCard';

interface Props {
  eventId: string;
  competitionId: string;
  resultScope: 'QUALIFICATION' | 'FINAL';
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
  const [cases, setCases] = useState<IrregularShotCaseDto[]>([]);
  const [reports, setReports] = useState<RangeIncidentReportDto[]>([]);
  const [decisions, setDecisions] = useState<ScoringDecisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caseResponse, reportResponse, decisionResponse] = await Promise.all([
        irregularShotCasesService.list({ eventId, resultScope }),
        incidentReportsService.listByEvent({ eventId }),
        scoringDecisionsService.listByEvent({ eventId, resultScope }),
      ]);
      const listed = unwrap(caseResponse);
      const reportStatus = unwrap(reportResponse);
      const decisionList = unwrap(decisionResponse);
      setCases(listed.filter((value) => value.competitionId === competitionId));
      setReports(reportStatus.reports.filter((report) => !report.voided));
      setDecisions(
        decisionList.decisions.filter(
          (decision) =>
            decision.active &&
            decision.type !== 'REVOCATION' &&
            (!decision.sourceCompetitionId || decision.sourceCompetitionId === competitionId),
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [competitionId, eventId, resultScope, setError]);

  useEffect(() => {
    void load();
  }, [load]);

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
        eventId={eventId}
        competitionId={competitionId}
        resultScope={resultScope}
        lanes={lanes}
        adjudication={adjudication}
        disabled={disabled}
        saving={saving}
        run={run}
        onCreated={(created) => setCases((current) => [...current, created])}
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
          onChanged={(changed) =>
            setCases((current) => current.map((item) => (item.id === changed.id ? changed : item)))
          }
          onError={setError}
        />
      ))}
    </div>
  );
}
