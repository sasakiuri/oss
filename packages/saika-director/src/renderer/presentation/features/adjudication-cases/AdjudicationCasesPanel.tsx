import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  adjudicationCasesService,
  finalRecoveriesService,
  incidentReportsService,
  protestsService,
  rangeInterruptionsService,
  scoringDecisionsService,
  targetExaminationsService,
} from '@/renderer/services';
import { useAsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { errorMessage, unwrap } from '@/renderer/services/serviceError';
import type { AdjudicationCaseDto } from '@/shared/ipc/contracts';

import { CaseListItem } from '../shared/cases/CaseListItem';
import { Button } from '../shared/common/Button';
import { InlineError } from '../shared/common/InlineError';

import { AdjudicationCaseDetail } from './AdjudicationCaseDetail';
import { type ArtifactCandidate, artifactCandidates } from './artifactCandidates';
import { CreateAdjudicationCaseForm } from './CreateAdjudicationCaseForm';

export function AdjudicationCasesPanel({ eventId }: { eventId: string }) {
  const [cases, setCases] = useState<AdjudicationCaseDto[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [candidates, setCandidates] = useState<ArtifactCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const { busy: saving, error, setError, run } = useAsyncAction();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        caseResponse,
        incidentResponse,
        protestResponse,
        decisionResponse,
        recoveryResponse,
        interruptionResponse,
        examinationResponse,
      ] = await Promise.all([
        adjudicationCasesService.list({ scopeType: 'EVENT', scopeId: eventId }),
        incidentReportsService.listByEvent({ eventId }),
        protestsService.list({ scopeType: 'EVENT', scopeId: eventId }),
        scoringDecisionsService.listByEvent({ eventId }),
        finalRecoveriesService.listByEvent({ eventId }),
        rangeInterruptionsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
        targetExaminationsService.listByScope({ scopeType: 'EVENT', scopeId: eventId }),
      ]);
      const listed = unwrap(caseResponse);
      const incidents = unwrap(incidentResponse);
      const protests = unwrap(protestResponse);
      const decisions = unwrap(decisionResponse);
      const recoveries = unwrap(recoveryResponse);
      const interruptions = unwrap(interruptionResponse);
      const examinations = unwrap(examinationResponse);
      setCases(listed);
      setSelectedId((current) => (listed.some((value) => value.id === current) ? current : (listed[0]?.id ?? '')));
      setCandidates(
        artifactCandidates({
          reports: incidents.reports,
          interruptions,
          examinations,
          decisions: decisions.decisions,
          protests,
          recoveries,
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [eventId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => cases.find((value) => value.id === selectedId) ?? null, [cases, selectedId]);
  const replaceCase = (value: AdjudicationCaseDto) => {
    setCases((current) => current.map((item) => (item.id === value.id ? value : item)));
    setSelectedId(value.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-vscode-text">Adjudication cases</h2>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            Optional case files link independent decisions, reports, and protests without changing their own ledgers.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={loading || saving} onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && <InlineError>{error}</InlineError>}

      <CreateAdjudicationCaseForm
        eventId={eventId}
        disabled={saving}
        run={run}
        onCreated={(value) => {
          setCases((current) => [...current, value]);
          setSelectedId(value.id);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[3px] border border-vscode-border">
          {cases.length === 0 && !loading && <p className="p-3 text-xs text-vscode-text-muted">No case files.</p>}
          {cases.map((value) => (
            <CaseListItem key={value.id} selected={value.id === selectedId} onSelect={() => setSelectedId(value.id)}>
              <span className="block text-[13px] font-medium text-vscode-text">{value.subject}</span>
              <span className="mt-0.5 block text-xs text-vscode-text-muted">
                {value.category} · {value.status} · {value.links.length} links
              </span>
            </CaseListItem>
          ))}
        </div>

        {selected && (
          <AdjudicationCaseDetail
            value={selected}
            candidates={candidates}
            saving={saving}
            run={run}
            onChanged={replaceCase}
          />
        )}
      </div>
    </div>
  );
}
