import { useState } from 'react';

import type { TargetExaminationCaseDto, TargetExaminationScopePayload } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';

import { EvidenceFilesPanel } from './EvidenceFilesPanel';
import { EvidenceForm, EntryForm } from './ExaminationEntryForms';
import { Detail } from './ExaminationFields';
import { formatEnum, statusClass, statusLabel } from './examinationPresentation';
import type { TargetExaminationCommands } from './examinationTypes';
import { LinkScopeForm } from './LinkScopeForm';

export function CaseDetail({
  examination,
  additionalScopes,
  saving,
  commands,
}: {
  examination: TargetExaminationCaseDto;
  additionalScopes: readonly TargetExaminationScopePayload[];
  saving: boolean;
  commands: TargetExaminationCommands;
}) {
  const [form, setForm] = useState<'evidence' | 'entry' | null>(null);
  const onCancelForm = () => setForm(null);
  const missingScopes = additionalScopes.filter(
    (candidate) =>
      !examination.scopes.some(
        (scope) => scope.scopeType === candidate.scopeType && scope.scopeId === candidate.scopeId,
      ),
  );

  return (
    <div className="space-y-3">
      <div className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-vscode-text">{examination.summary}</h3>
            <p className="mt-1 text-xs text-vscode-text-muted">
              {formatEnum(examination.issueKind)} · {new Date(examination.occurredAt).toLocaleString()} · Case{' '}
              {examination.id.slice(0, 8)}
            </p>
          </div>
          <span className={`text-xs font-semibold ${statusClass(examination)}`}>{statusLabel(examination)}</span>
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Detail
            label="Target"
            value={examination.firingPointNumber ? `Firing point ${examination.firingPointNumber}` : 'Range-wide'}
          />
          <Detail label="Athlete" value={examination.athleteName ?? 'Not recorded'} />
          <Detail label="Shot reference" value={examination.shotId ?? 'Not recorded'} />
          <Detail label="Rules" value={examination.ruleReferences} />
          <Detail label="Opened by" value={examination.openedBy} />
          <Detail label="Scopes" value={examination.scopes.map((scope) => scope.scopeType.toLowerCase()).join(', ')} />
        </dl>
        <p className="mt-3 whitespace-pre-wrap border-t border-vscode-border pt-3 text-[13px] leading-5 text-vscode-text">
          {examination.details}
        </p>
        {examination.status !== 'VOID' && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-vscode-border pt-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || examination.status !== 'OPEN'}
              onClick={() => setForm('evidence')}
            >
              Add evidence
            </Button>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => setForm('entry')}>
              Record action
            </Button>
          </div>
        )}
      </div>

      {missingScopes.map((scope) => (
        <LinkScopeForm
          key={`${scope.scopeType}:${scope.scopeId}`}
          examination={examination}
          scope={scope}
          saving={saving}
          onSubmitCommand={commands.linkScope}
        />
      ))}

      {form === 'evidence' && (
        <EvidenceForm
          examination={examination}
          saving={saving}
          onCancel={onCancelForm}
          onSubmitCommand={commands.addEvidence}
        />
      )}
      {form === 'entry' && (
        <EntryForm
          examination={examination}
          saving={saving}
          onCancel={onCancelForm}
          onSubmitCommand={commands.appendEntry}
        />
      )}

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold text-vscode-text">ISSF workflow guidance</h4>
          <span className="text-[11px] text-vscode-dimmed">Advisory only · {examination.workflow.policyId}</span>
        </div>
        <ul className="mt-2 space-y-2">
          {examination.workflow.steps.map((step) => (
            <li key={step.id} className="border-t border-vscode-border pt-2 text-xs first:border-t-0 first:pt-0">
              <p className="font-semibold text-vscode-text">
                {step.status === 'COMPLETE' ? '✓' : step.status === 'MISSING' ? '○' : '◇'} {step.label}
              </p>
              <p className="text-vscode-text-muted">{step.guidance}</p>
              <p className="text-vscode-dimmed">
                {step.ruleReference} · {formatEnum(step.status)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <h4 className="text-xs font-semibold text-vscode-text">Examination items ({examination.evidence.length})</h4>
        {examination.evidence.length === 0 ? (
          <p className="mt-2 text-xs text-vscode-text-muted">No examination items recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {examination.evidence.map((item) => (
              <li
                key={item.id}
                className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
              >
                <p className="font-semibold text-vscode-text">{formatEnum(item.type)}</p>
                <p className="text-vscode-text-muted">{item.description}</p>
                <p className="text-vscode-dimmed">
                  Collected by {item.collectedBy} · {new Date(item.collectedAt).toLocaleString()}
                  {item.reference ? ` · ${item.reference}` : ''}
                </p>
                {item.contentHashSha256 && (
                  <code className="block break-all text-[10px] text-vscode-dimmed">
                    SHA-256 {item.contentHashSha256}
                  </code>
                )}
                <EvidenceFilesPanel
                  caseId={examination.id}
                  evidenceId={item.id}
                  canImport={examination.status === 'OPEN'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-[3px] border border-vscode-border bg-vscode-bg p-3">
        <h4 className="text-xs font-semibold text-vscode-text">Audit history ({examination.entries.length})</h4>
        {examination.entries.length === 0 ? (
          <p className="mt-2 text-xs text-vscode-text-muted">The initial evidence hold is active.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {examination.entries.map((entry) => (
              <li
                key={entry.id}
                className="border-t border-vscode-border pt-2 text-xs leading-5 first:border-t-0 first:pt-0"
              >
                <p className="font-semibold text-vscode-text">
                  {formatEnum(entry.type)} · {entry.officialName}
                </p>
                <p className="text-vscode-text-muted">{entry.statement}</p>
                <p className="text-vscode-dimmed">
                  {new Date(entry.recordedAt).toLocaleString()}
                  {entry.ruleReference ? ` · ${entry.ruleReference}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
