import { useState } from 'react';
import { UserPlus } from 'lucide-react';

import type { ChampionshipOfficialRoleDto, ResultsBookWorkspaceDto } from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { inputClass, stackedLabelClass } from '../../shared/common/formClasses';

import { ResultsBookField } from './ResultsBookField';
import { OFFICIAL_ROLES, roleLabel } from './resultsBookPresentation';
import type { ResultsBookCommands } from './useResultsBookWorkspace';

interface OfficialAppointmentsFormProps {
  officials: ResultsBookWorkspaceDto['officials'] | undefined;
  signingAccounts: { id: string; name: string }[];
  busy: boolean;
  commands: Pick<ResultsBookCommands, 'appointOfficial' | 'revokeOfficial'>;
}

/** Records and revokes championship official appointments. */
export function OfficialAppointmentsForm({
  officials,
  signingAccounts,
  busy,
  commands,
}: OfficialAppointmentsFormProps) {
  const [role, setRole] = useState<ChampionshipOfficialRoleDto>('TECHNICAL_DELEGATE');
  const [officialName, setOfficialName] = useState('');
  const [organization, setOrganization] = useState('');
  const [appointmentStatement, setAppointmentStatement] = useState('Appointment recorded for this championship');
  const [recordedBy, setRecordedBy] = useState('');
  const [officialActorId, setOfficialActorId] = useState('');

  const appoint = () =>
    commands.appointOfficial(
      {
        role,
        officialName: officialName.trim(),
        ...(organization.trim() ? { organization: organization.trim() } : {}),
        statement: appointmentStatement.trim(),
        recordedBy: recordedBy.trim(),
        ...(officialActorId ? { officialActorId } : {}),
      },
      () => {
        setOfficialName('');
        setOrganization('');
        setOfficialActorId('');
      },
    );

  const revoke = (appointmentId: string) =>
    commands.revokeOfficial({
      appointmentId,
      statement: appointmentStatement.trim(),
      recordedBy: recordedBy.trim(),
    });

  const canAppoint = Boolean(officialName.trim() && appointmentStatement.trim() && recordedBy.trim() && !busy);

  return (
    <>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        <label className={stackedLabelClass}>
          Role
          <select
            className={inputClass}
            value={role}
            onChange={(event) => setRole(event.target.value as ChampionshipOfficialRoleDto)}
          >
            {OFFICIAL_ROLES.map((item) => (
              <option key={item} value={item}>
                {roleLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <ResultsBookField label="Official name" value={officialName} onChange={setOfficialName} />
        <label className={stackedLabelClass}>
          Signing account (optional)
          <select
            className={inputClass}
            value={officialActorId}
            onChange={(event) => {
              setOfficialActorId(event.target.value);
              const account = signingAccounts.find((item) => item.id === event.target.value);
              if (account) setOfficialName(account.name);
            }}
          >
            <option value="">Manual / external signature</option>
            {signingAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <ResultsBookField label="Organization (optional)" value={organization} onChange={setOrganization} />
        <ResultsBookField label="Recorded by" value={recordedBy} onChange={setRecordedBy} />
        <ResultsBookField
          label="Appointment / revocation statement"
          value={appointmentStatement}
          onChange={setAppointmentStatement}
        />
      </div>
      <p className="mt-2 text-xs text-vscode-text-muted">
        Link an account for personal signing. Changes to appointments require administration when sign-in is required.
      </p>
      <Button className="mt-3" size="sm" disabled={!canAppoint} onClick={() => void appoint()}>
        <UserPlus size={13} aria-hidden="true" /> Record appointment
      </Button>
      <ul className="mt-3 divide-y divide-vscode-border border-y border-vscode-border">
        {officials?.map((official) => (
          <li key={official.appointmentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
            <span className="text-vscode-text">
              {roleLabel(official.role)} · {official.officialName}
              {official.organization ? ` · ${official.organization}` : ''}
            </span>
            <Button
              size="sm"
              variant="danger"
              disabled={!recordedBy.trim() || !appointmentStatement.trim() || busy}
              onClick={() => void revoke(official.appointmentId)}
            >
              Revoke
            </Button>
          </li>
        ))}
        {officials?.length === 0 && <li className="py-2 text-xs text-vscode-text-muted">No active appointments.</li>}
      </ul>
    </>
  );
}
