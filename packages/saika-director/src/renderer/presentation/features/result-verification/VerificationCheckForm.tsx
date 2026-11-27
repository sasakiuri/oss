import type { AddVerificationCheckPayload, ResultScope, VerificationResultItemDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { fullWidthInputClass } from '../shared/common/formClasses';

import type { ResultVerificationCommands } from './useResultVerification';

type EvidenceSource = AddVerificationCheckPayload['evidenceSource'];
type ComparisonStatus = AddVerificationCheckPayload['comparisonStatus'];

/** The comparison a Jury member is entering. The official name stays when another result is reviewed. */
export interface VerificationCheckDraft {
  evidenceSource: EvidenceSource;
  evidenceReference: string;
  comparisonStatus: ComparisonStatus;
  manualInterventionsReviewed: boolean;
  note: string;
  officialName: string;
}

export const initialCheckDraft: VerificationCheckDraft = {
  evidenceSource: 'INDEPENDENT_MEMORY',
  evidenceReference: '',
  comparisonStatus: 'MATCHED',
  manualInterventionsReviewed: false,
  note: '',
  officialName: '',
};

/** The draft for reviewing a result: its current check, or the defaults, with the same official. */
export function reviewCheckDraft(
  draft: VerificationCheckDraft,
  result: VerificationResultItemDto,
): VerificationCheckDraft {
  return {
    ...draft,
    evidenceSource: result.currentCheck?.evidenceSource ?? 'INDEPENDENT_MEMORY',
    evidenceReference: result.currentCheck?.evidenceReference ?? '',
    comparisonStatus: result.currentCheck?.comparisonStatus ?? 'MATCHED',
    manualInterventionsReviewed: result.currentCheck?.manualInterventionsReviewed ?? false,
    note: result.currentCheck?.note ?? '',
  };
}

/** Appends an RTS Jury comparison for the selected result. */
export function VerificationCheckForm({
  eventId,
  resultScope,
  result,
  draft,
  saving,
  onChange,
  onSubmit,
}: {
  eventId: string;
  resultScope: ResultScope;
  result: VerificationResultItemDto;
  draft: VerificationCheckDraft;
  saving: boolean;
  onChange: (patch: Partial<VerificationCheckDraft>) => void;
  onSubmit: ResultVerificationCommands['addCheck'];
}) {
  const submit = () =>
    onSubmit({
      eventId,
      resultScope,
      resultId: result.resultId,
      resultRevision: result.revision,
      evidenceSource: draft.evidenceSource,
      evidenceReference: draft.evidenceReference,
      comparisonStatus: draft.comparisonStatus,
      manualInterventionsReviewed: draft.manualInterventionsReviewed,
      ...(draft.note.trim() ? { note: draft.note } : {}),
      officialName: draft.officialName,
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="space-y-3 border-t border-vscode-border pt-4"
    >
      <h3 className="text-[13px] font-semibold text-vscode-text">
        Append comparison — #{result.rank} {result.playerName}
      </h3>
      <p className="text-xs text-vscode-text-muted">
        Stored MQTT evidence is diagnostic context. Enter the target printout or independent-memory reference actually
        used by the RTS Jury. Other evidence is retained for audit but does not satisfy ISSF 6.14.8.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-vscode-text-muted">
          Independent source
          <select
            className={`${fullWidthInputClass} mt-1`}
            value={draft.evidenceSource}
            onChange={(event) => onChange({ evidenceSource: event.target.value as EvidenceSource })}
          >
            <option value="TARGET_PRINTOUT">Target printout</option>
            <option value="INDEPENDENT_MEMORY">Independent memory</option>
            <option value="OTHER">Other evidence (audit only)</option>
          </select>
        </label>
        <label className="text-xs text-vscode-text-muted sm:col-span-2">
          Source reference / printout ID
          <input
            className={`${fullWidthInputClass} mt-1`}
            required
            value={draft.evidenceReference}
            onChange={(event) => onChange({ evidenceReference: event.target.value })}
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-vscode-text-muted">
          Score comparison
          <select
            className={`${fullWidthInputClass} mt-1`}
            value={draft.comparisonStatus}
            onChange={(event) => onChange({ comparisonStatus: event.target.value as ComparisonStatus })}
          >
            <option value="MATCHED">Matched</option>
            <option value="MISMATCH">Mismatch found</option>
            <option value="UNAVAILABLE">Unable to compare</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs text-vscode-text">
          <input
            type="checkbox"
            checked={draft.manualInterventionsReviewed}
            onChange={(event) => onChange({ manualInterventionsReviewed: event.target.checked })}
          />
          Reviewed all {result.decisionCount} manual intervention(s)
        </label>
      </div>
      <label className="block text-xs text-vscode-text-muted">
        Verification note
        <textarea
          className={`${fullWidthInputClass} mt-1 min-h-14 resize-y`}
          value={draft.note}
          onChange={(event) => onChange({ note: event.target.value })}
        />
      </label>
      <label className="block text-xs text-vscode-text-muted">
        RTS Jury member
        <input
          className={`${fullWidthInputClass} mt-1`}
          required
          value={draft.officialName}
          onChange={(event) => onChange({ officialName: event.target.value })}
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={saving || result.status !== 'confirmed'}>
          {saving ? 'Saving…' : 'Append verification check'}
        </Button>
      </div>
    </form>
  );
}
