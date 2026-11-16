import { BookOpen, RefreshCw } from 'lucide-react';

import { Button } from '../shared/common/Button';
import { sectionClass } from '../shared/common/formClasses';
import { InlineError } from '../shared/common/InlineError';

import { OfficialAppointmentsForm } from './OfficialAppointmentsForm';
import { RecordClaimCreateForm } from './RecordClaimCreateForm';
import { RecordClaimReview } from './RecordClaimReview';
import { ResultsBookVersionsForm } from './ResultsBookVersionsForm';
import { useResultsBookWorkspace } from './useResultsBookWorkspace';

export function ResultsBookPanel({ championshipId }: { championshipId: string }) {
  const { workspace, signingAccounts, busy, error, load, commands } = useResultsBookWorkspace(championshipId);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <BookOpen size={16} aria-hidden="true" /> Official Results Book and records
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            Save official appointments, record claims, and certifications under ISSF 6.14.4–6.14.5, 6.14.9 and Annex R.
            Entries cannot be overwritten.
          </p>
        </div>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError>{error}</InlineError>}

      <details className={sectionClass} open={(workspace?.officials.length ?? 0) === 0}>
        <summary className={summaryClass}>1. Championship official appointments</summary>
        <p className={helpClass}>
          Register each official's role here. Link an operator account to record signed-in confirmations.
        </p>
        <OfficialAppointmentsForm
          officials={workspace?.officials}
          signingAccounts={signingAccounts}
          busy={busy}
          commands={commands}
        />
      </details>

      <details className={sectionClass}>
        <summary className={summaryClass}>2. Record claims and verification</summary>
        <p className={helpClass}>
          RPO, MQS and OOC entries are ineligible. Only Technical Committee verified claims enter the certified book;
          unresolved claims block certification.
        </p>
        <RecordClaimCreateForm
          eligibleRecordResults={workspace?.eligibleRecordResults}
          busy={busy}
          createRecordClaim={commands.createRecordClaim}
        />
        <RecordClaimReview
          officials={workspace?.officials}
          recordClaims={workspace?.recordClaims}
          busy={busy}
          appendRecordClaimEntry={commands.appendRecordClaimEntry}
        />
      </details>

      <details className={sectionClass} open>
        <summary className={summaryClass}>3. Generate, certify and export Results Book</summary>
        <ResultsBookVersionsForm books={workspace?.books} busy={busy} commands={commands} />
      </details>
    </div>
  );
}

const summaryClass = 'cursor-pointer text-xs font-semibold text-vscode-text';
const helpClass = 'mt-2 text-xs text-vscode-text-muted';
