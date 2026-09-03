import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

import { estChampionshipInspectionsService } from '@/renderer/services';
import type { EstChampionshipInspectionAssessmentDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';

export function EstChampionshipInspectionPanel({ championshipId }: { championshipId: string }) {
  const [assessment, setAssessment] = useState<EstChampionshipInspectionAssessmentDto | null>(null);
  const [targetText, setTargetText] = useState('');
  const [methodStatement, setMethodStatement] = useState(
    'Scoring function and accuracy checked under normal conditions of use',
  );
  const [createdBy, setCreatedBy] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [technicalDelegateName, setTechnicalDelegateName] = useState('');
  const [statement, setStatement] = useState('Function and accuracy verified');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await estChampionshipInspectionsService.get({ championshipId });
    if (!response.success) setError(response.error.message);
    else {
      setAssessment(response.data);
      if (response.data.plan) setTargetText(response.data.plan.targetIdentifiers.join('\n'));
    }
  }, [championshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createPlan = async () => {
    const targetIdentifiers = parseTargets(targetText);
    if (targetIdentifiers.length === 0 || !createdBy.trim() || !methodStatement.trim()) return;
    await run(async () => {
      const response = await estChampionshipInspectionsService.createPlan({
        championshipId,
        targetIdentifiers,
        methodStatement: methodStatement.trim(),
        createdBy: createdBy.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setAssessment(response.data);
    });
  };

  const record = async (targetIdentifier: string, outcome: 'PASSED' | 'FAILED') => {
    if (!assessment?.plan) return;
    await run(async () => {
      const response = await estChampionshipInspectionsService.record({
        planId: assessment.plan!.id,
        targetIdentifiers: [targetIdentifier],
        outcome,
        statement: statement.trim(),
        ...(evidenceReference.trim() ? { evidenceReference: evidenceReference.trim() } : {}),
        performedBy: performedBy.trim(),
        technicalDelegateName: technicalDelegateName.trim(),
        inspectedAt: new Date().toISOString(),
      });
      if (!response.success) throw new Error(response.error.message);
      setAssessment(response.data);
    });
  };

  const revoke = async (entryId: string) => {
    if (!assessment?.plan) return;
    await run(async () => {
      const response = await estChampionshipInspectionsService.revoke({
        planId: assessment.plan!.id,
        entryId,
        statement: statement.trim(),
        performedBy: performedBy.trim(),
        technicalDelegateName: technicalDelegateName.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setAssessment(response.data);
    });
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const canRecord = Boolean(performedBy.trim() && technicalDelegateName.trim() && statement.trim() && !busy);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <ShieldCheck size={16} aria-hidden="true" /> Championship EST inspection
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            {assessment?.ruleReference ?? 'ISSF 6.3.2.8'} · Technical Delegate supervised function and accuracy evidence
            · {assessment?.ready ? 'ready' : 'not ready'}
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}

      <details open={!assessment?.plan} className="rounded-[3px] border border-vscode-border p-3">
        <summary className="cursor-pointer text-xs font-medium text-vscode-text">
          {assessment?.plan ? `Inspection plan v${assessment.plan.versionNumber}` : 'Create inspection plan'}
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className={`${labelClass} md:col-span-2`}>
            Target identifiers, one per line or comma-separated
            <textarea
              className={`${inputClass} min-h-20 resize-y`}
              value={targetText}
              onChange={(event) => setTargetText(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            Plan author
            <input className={inputClass} value={createdBy} onChange={(event) => setCreatedBy(event.target.value)} />
          </label>
          <label className={`${labelClass} md:col-span-3`}>
            Test method
            <input
              className={inputClass}
              value={methodStatement}
              onChange={(event) => setMethodStatement(event.target.value)}
            />
          </label>
        </div>
        <Button
          className="mt-3"
          size="sm"
          disabled={busy || parseTargets(targetText).length === 0 || !createdBy.trim() || !methodStatement.trim()}
          onClick={() => void createPlan()}
        >
          {assessment?.plan ? 'Create revised plan' : 'Create plan'}
        </Button>
      </details>

      {assessment?.plan && (
        <>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Test operator" value={performedBy} onChange={setPerformedBy} />
            <Field
              label="Supervising Technical Delegate"
              value={technicalDelegateName}
              onChange={setTechnicalDelegateName}
            />
            <Field label="Audit statement" value={statement} onChange={setStatement} />
            <Field label="Evidence reference (optional)" value={evidenceReference} onChange={setEvidenceReference} />
          </div>
          <ul className="divide-y divide-vscode-border border-y border-vscode-border">
            {assessment.targets.map((target) => (
              <li
                key={target.targetIdentifier}
                className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs"
              >
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-vscode-text">
                    {target.status === 'PASSED' ? (
                      <CheckCircle2 size={14} className="text-vscode-success" />
                    ) : (
                      <XCircle size={14} className="text-vscode-warning" />
                    )}
                    {target.targetIdentifier} · {target.status}
                  </p>
                  {target.latestEntry && (
                    <p className="mt-0.5 text-vscode-text-muted">
                      {target.latestEntry.performedBy} · TD {target.latestEntry.technicalDelegateName} ·{' '}
                      {new Date(target.latestEntry.inspectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!canRecord}
                    onClick={() => void record(target.targetIdentifier, 'PASSED')}
                  >
                    Pass
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canRecord}
                    onClick={() => void record(target.targetIdentifier, 'FAILED')}
                  >
                    Fail
                  </Button>
                  {target.latestEntry && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canRecord}
                      onClick={() => void revoke(target.latestEntry!.id)}
                    >
                      Revoke latest
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parseTargets(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

const labelClass = 'flex flex-col gap-1 text-xs text-vscode-text-muted';
const inputClass =
  'min-h-8 rounded-[3px] border border-vscode-border bg-vscode-input px-2 py-1 text-[13px] text-vscode-text';
