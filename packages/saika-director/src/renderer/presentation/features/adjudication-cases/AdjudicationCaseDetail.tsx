import { useState } from 'react';

import type { AsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { adjudicationCasesService } from '@/renderer/services';
import { unwrapData } from '@/renderer/services/serviceError';
import type { AdjudicationCaseDto } from '@/shared/ipc/contracts';

import { useEntryTypeSelection } from '../shared/cases/useEntryTypeSelection';
import { Button } from '../shared/common/Button';
import { paddedInputClass } from '../shared/common/formClasses';

import type { ArtifactCandidate } from './artifactCandidates';

/**
 * The selected case file with its links, history and entry form. The panel does not key it by case, so the official
 * name, statement and choices stay when another case is selected.
 */
export function AdjudicationCaseDetail({
  value,
  candidates,
  saving,
  run,
  onChanged,
}: {
  value: AdjudicationCaseDto;
  candidates: readonly ArtifactCandidate[];
  saving: boolean;
  run: AsyncAction['run'];
  onChanged: (value: AdjudicationCaseDto) => void;
}) {
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('');
  const [ruleReference, setRuleReference] = useState('');
  const entryTypes = availableEntryTypes(value.status);
  const [entryType, setEntryType] = useEntryTypeSelection(entryTypes, 'NOTE');
  const [candidateKey, setCandidateKey] = useState('');
  const availableCandidates = candidates.filter(
    (candidate) =>
      !value.links.some((link) => link.artifactType === candidate.type && link.artifactId === candidate.id),
  );
  const selectedCandidate = availableCandidates.find((candidate) => candidate.key === candidateKey);

  const change = (operation: () => ReturnType<typeof adjudicationCasesService.appendEntry>): Promise<boolean> =>
    run(async () => {
      onChanged(unwrapData(await operation(), 'Case operation failed'));
      setStatement('');
      setRuleReference('');
    });

  return (
    <div className="space-y-4 rounded-[3px] border border-vscode-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-vscode-text">{value.subject}</h3>
          <span className="text-xs text-vscode-text-muted">{value.status}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-vscode-text-muted">{value.summary}</p>
      </div>

      <section>
        <p className="text-xs font-semibold text-vscode-text">Linked official records</p>
        <div className="mt-2 space-y-2">
          {value.links.length === 0 && <p className="text-xs text-vscode-text-muted">No artifacts linked.</p>}
          {value.links.map((link) => (
            <div
              key={link.id}
              className="flex items-start justify-between gap-3 rounded-[3px] border border-vscode-border p-2"
            >
              <div className="min-w-0 text-xs">
                <p className="truncate font-medium text-vscode-text">{link.labelSnapshot}</p>
                <p className="text-vscode-text-muted">
                  {link.artifactType} · {link.relation} · {link.statement}
                </p>
              </div>
              {value.status !== 'CLOSED' && value.status !== 'VOID' && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving || !officialName.trim() || !statement.trim()}
                  onClick={() =>
                    void change(() =>
                      adjudicationCasesService.unlinkArtifact({
                        caseId: value.id,
                        linkId: link.id,
                        statement,
                        officialName,
                      }),
                    )
                  }
                >
                  Unlink
                </Button>
              )}
            </div>
          ))}
        </div>
        {value.status !== 'CLOSED' && value.status !== 'VOID' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              value={candidateKey}
              onChange={(event) => setCandidateKey(event.target.value)}
              className={`${paddedInputClass} flex-1`}
            >
              <option value="">Select an official record</option>
              {availableCandidates.map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={saving || !selectedCandidate || !officialName.trim() || !statement.trim()}
              onClick={() => {
                if (!selectedCandidate) return;
                void change(() =>
                  adjudicationCasesService.linkArtifact({
                    caseId: value.id,
                    artifactType: selectedCandidate.type,
                    artifactId: selectedCandidate.id,
                    relation: selectedCandidate.relation,
                    labelSnapshot: selectedCandidate.label,
                    statement,
                    officialName,
                  }),
                ).then((succeeded) => {
                  if (succeeded) setCandidateKey('');
                });
              }}
            >
              Link record
            </Button>
          </div>
        )}
      </section>

      <section>
        <p className="text-xs font-semibold text-vscode-text">Case history</p>
        <div className="mt-2 space-y-1 text-xs text-vscode-text-muted">
          {value.entries.length === 0 && <p>No appended entries.</p>}
          {value.entries.map((entry) => (
            <p key={entry.id}>
              {entry.type} · {entry.statement} · {entry.officialName} · {new Date(entry.occurredAt).toLocaleString()}
            </p>
          ))}
        </div>
      </section>

      <div className="grid gap-2 md:grid-cols-2">
        <input
          className={paddedInputClass}
          placeholder="Official name"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
        />
        <input
          className={paddedInputClass}
          placeholder="Statement / link reason"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
        <select
          value={entryType}
          onChange={(event) => setEntryType(event.target.value as typeof entryType)}
          className={paddedInputClass}
        >
          {entryTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          className={paddedInputClass}
          placeholder="Rule reference (optional)"
          value={ruleReference}
          onChange={(event) => setRuleReference(event.target.value)}
        />
      </div>
      <Button
        size="sm"
        disabled={saving || value.status === 'VOID' || !officialName.trim() || !statement.trim()}
        onClick={() =>
          void change(() =>
            adjudicationCasesService.appendEntry({
              caseId: value.id,
              type: entryType,
              statement,
              officialName,
              ...(ruleReference.trim() ? { ruleReference } : {}),
            }),
          )
        }
      >
        Append case entry
      </Button>
    </div>
  );
}

function availableEntryTypes(status: AdjudicationCaseDto['status']): AdjudicationCaseDto['entries'][number]['type'][] {
  if (status === 'VOID') return ['NOTE'];
  if (status === 'CLOSED') return ['NOTE', 'REOPENED'];
  if (status === 'RESOLVED') return ['NOTE', 'CLOSED', 'REOPENED', 'VOID'];
  if (status === 'REFERRED') return ['NOTE', 'RESOLVED', 'VOID'];
  return ['NOTE', 'REFERRED', 'RESOLVED', 'VOID'];
}
