import { Button } from '../shared/common/Button';

import type { RecordClaim, RecordEntryType } from './resultsBookPresentation';

/** The entries a record claim accepts in its current status. */
export function RecordClaimActions({
  claim,
  busy,
  hasActor,
  hasDelegate,
  hasTechnicalReference,
  onAction,
}: {
  claim: RecordClaim;
  busy: boolean;
  hasActor: boolean;
  hasDelegate: boolean;
  hasTechnicalReference: boolean;
  onAction: (type: RecordEntryType) => void;
}) {
  const action = (type: RecordEntryType, label: string, enabled: boolean, danger = false) => (
    <Button
      key={type}
      size="sm"
      variant={danger ? 'danger' : 'secondary'}
      disabled={busy || !enabled}
      onClick={() => onAction(type)}
    >
      {label}
    </Button>
  );
  const actions = [];
  if (claim.status === 'DRAFT') actions.push(action('TD_CONFIRMED', 'TD confirm', hasDelegate));
  if (claim.status === 'TD_CONFIRMED') actions.push(action('SUBMITTED', 'Record submission', hasActor));
  if (claim.status === 'SUBMITTED') {
    actions.push(action('TECHNICAL_COMMITTEE_VERIFIED', 'Verify', hasTechnicalReference));
    actions.push(action('REJECTED', 'Reject', hasActor, true));
  }
  if (claim.status === 'REJECTED') actions.push(action('REOPENED', 'Reopen', hasActor));
  if (claim.status !== 'VOID') {
    actions.push(action('VOID', 'Void', claim.status === 'VERIFIED' ? hasTechnicalReference : hasActor, true));
  }
  return <div className="flex flex-wrap gap-2">{actions}</div>;
}
