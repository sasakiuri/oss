import { useState } from 'react';
import { BadgeCheck, Download } from 'lucide-react';

import type { OfficialSigningMethod, ResultsBookDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { inputClass, stackedLabelClass } from '../shared/common/formClasses';
import { officialSigningRequest } from '../shared/common/officialSigningRequest';

import { ResultsBookField } from './ResultsBookField';
import { roleLabel } from './resultsBookPresentation';
import type { ResultsBookCommands } from './useResultsBookWorkspace';

interface ResultsBookVersionsFormProps {
  books: ResultsBookDto[] | undefined;
  busy: boolean;
  commands: Pick<ResultsBookCommands, 'generateBook' | 'signBook' | 'finalizeBook' | 'exportBook'>;
}

/** Generates Results Book versions, records their signatures, certifies and exports them. */
export function ResultsBookVersionsForm({ books, busy, commands }: ResultsBookVersionsFormProps) {
  const [bookCreatedBy, setBookCreatedBy] = useState('');
  const [signatureStatement, setSignatureStatement] = useState('I certify this Results Book version');
  const [signatureMethod, setSignatureMethod] = useState<OfficialSigningMethod>('SELF');
  const [signatureRecorder, setSignatureRecorder] = useState('');
  const [signatureEvidence, setSignatureEvidence] = useState('');
  const [finalizedBy, setFinalizedBy] = useState('');
  const [finalizationStatement, setFinalizationStatement] = useState(
    'Required contents and certification signatures have been verified',
  );

  const generateBook = () => commands.generateBook({ createdBy: bookCreatedBy.trim() });

  const signBook = (bookId: string, appointmentId: string) =>
    commands.signBook({
      bookId,
      appointmentId,
      statement: signatureStatement.trim(),
      ...officialSigningRequest(signatureMethod, signatureRecorder, signatureEvidence),
    });

  const finalizeBook = (bookId: string) =>
    commands.finalizeBook({
      bookId,
      officialName: finalizedBy.trim(),
      statement: finalizationStatement.trim(),
    });

  return (
    <>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ResultsBookField label="Version prepared by" value={bookCreatedBy} onChange={setBookCreatedBy} />
        <ResultsBookField label="Signer statement" value={signatureStatement} onChange={setSignatureStatement} />
        <ResultsBookField label="Finalized by" value={finalizedBy} onChange={setFinalizedBy} />
        <ResultsBookField
          label="Finalization statement"
          value={finalizationStatement}
          onChange={setFinalizationStatement}
        />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <label className={stackedLabelClass}>
          Signature method
          <select
            className={inputClass}
            value={signatureMethod}
            onChange={(event) => setSignatureMethod(event.target.value as OfficialSigningMethod)}
          >
            <option value="SELF">Personal signature</option>
            <option value="EXTERNAL">Record an external signature</option>
          </select>
        </label>
        {signatureMethod === 'EXTERNAL' && (
          <>
            <ResultsBookField
              label="Recorded by (uses signed-in operator when available)"
              value={signatureRecorder}
              onChange={setSignatureRecorder}
            />
            <ResultsBookField
              label="Signed document / evidence reference"
              value={signatureEvidence}
              onChange={setSignatureEvidence}
            />
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-vscode-text-muted">
        Personal signing checks the linked account when signed in. Without sign-in, it is recorded as a manual
        confirmation. External signatures require evidence and retain the recorder separately from the appointed
        official.
      </p>
      <Button className="mt-3" size="sm" disabled={!bookCreatedBy.trim() || busy} onClick={() => void generateBook()}>
        Generate book version
      </Button>
      <ul className="mt-3 space-y-3">
        {[...(books ?? [])].reverse().map((book) => {
          const signedAppointments = new Set(book.signatures.map((signature) => signature.appointmentId));
          const allSigned = book.requiredSigners.every((signer) => signedAppointments.has(signer.appointmentId));
          return (
            <li key={book.id} className="rounded-[3px] border border-vscode-border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-medium text-vscode-text">
                  {book.status === 'CERTIFIED' && <BadgeCheck size={14} className="text-vscode-success" />}
                  Version {book.versionNumber} · {book.status} · {book.sourceHash.slice(0, 12)}…
                </p>
                <div className="flex flex-wrap gap-2">
                  {book.status === 'DRAFT' && (
                    <Button
                      size="sm"
                      disabled={
                        busy ||
                        book.findings.length > 0 ||
                        !allSigned ||
                        !finalizedBy.trim() ||
                        !finalizationStatement.trim()
                      }
                      onClick={() => void finalizeBook(book.id)}
                    >
                      Certify
                    </Button>
                  )}
                  {book.status === 'CERTIFIED' && (
                    <>
                      {(['JSON', 'HTML', 'PDF'] as const).map((format) => (
                        <Button
                          key={format}
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void commands.exportBook(book.id, format)}
                        >
                          <Download size={13} aria-hidden="true" /> Export {format}
                        </Button>
                      ))}
                    </>
                  )}
                </div>
              </div>
              {book.findings.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-vscode-warning">
                  {book.findings.map((finding) => (
                    <li key={finding}>{finding}</li>
                  ))}
                </ul>
              )}
              <ul className="mt-2 space-y-1">
                {book.requiredSigners.map((signer) => {
                  const signed = signedAppointments.has(signer.appointmentId);
                  const evidence = book.signatures.find(
                    (signature) => signature.appointmentId === signer.appointmentId,
                  )?.signingEvidence;
                  return (
                    <li
                      key={signer.appointmentId}
                      className="flex flex-wrap items-center justify-between gap-2 text-vscode-text-muted"
                    >
                      <span>
                        {roleLabel(signer.role)} · {signer.officialName} · {signed ? 'signed' : 'signature required'}
                        {signed && ` · ${evidence?.method ?? 'Legacy record'}`}
                        {evidence && ` · recorded by ${evidence.recordedBy}`}
                        {evidence?.evidenceReference && ` · ${evidence.evidenceReference}`}
                      </span>
                      {!signed && book.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={
                            busy ||
                            !signatureStatement.trim() ||
                            (signatureMethod === 'EXTERNAL' && !signatureEvidence.trim())
                          }
                          onClick={() => void signBook(book.id, signer.appointmentId)}
                        >
                          {signatureMethod === 'EXTERNAL' ? 'Record signature' : 'Sign'}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
        {books?.length === 0 && <li className="text-xs text-vscode-text-muted">No Results Book versions.</li>}
      </ul>
    </>
  );
}
