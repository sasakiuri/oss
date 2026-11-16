import { useState } from 'react';
import { FileCheck2, RefreshCw } from 'lucide-react';

import { sentenceCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type {
  StartListDisciplineGroupDto,
  StartListDistributionChannelDto,
  StartListDistributionModeDto,
  StartListFinalReleaseBasisDto,
  StartListKindDto,
  StartListOfficialRoleDto,
} from '@/shared/ipc/contracts';

import { Button } from '../../shared/common/Button';
import { toDateTimeLocalValue } from '../../shared/common/dateUtils';
import { mutedLabelClass, smallInputClass } from '../../shared/common/formClasses';
import { InlineError } from '../../shared/common/InlineError';
import { toggleSetMember } from '../../shared/common/toggleSetMember';

import { StartListSelectField } from './StartListSelectField';
import { StartListVersionDetail } from './StartListVersionDetail';
import { useStartListVersions } from './useStartListVersions';

interface StartListPanelProps {
  eventId: string;
  round?: 'Elimination' | 'Qualification' | 'Final' | 'Individual';
  sourceDirty: boolean;
}

export function StartListPanel({ eventId, round, sourceDirty }: StartListPanelProps) {
  const { versions, selected, select, busy, error, load, commands } = useStartListVersions(eventId);
  const [listKind, setListKind] = useState<StartListKindDto>(() => kindForRound(round));
  const [disciplineGroup, setDisciplineGroup] = useState<StartListDisciplineGroupDto>('RIFLE_PISTOL');
  const [distributionMode, setDistributionMode] = useState<StartListDistributionModeDto>('PRINTED');
  const [scheduledStartAt, setScheduledStartAt] = useState(() => defaultScheduledStart());
  const [publicationDueAt, setPublicationDueAt] = useState(() => defaultPublicationDue());
  const [officialName, setOfficialName] = useState('');
  const [officialRole, setOfficialRole] = useState<StartListOfficialRoleDto>('TECHNICAL_DELEGATE');
  const [statement, setStatement] = useState('Names, Bibs, relays, firing points, and distribution details checked');
  const [channels, setChannels] = useState<Set<StartListDistributionChannelDto>>(() => new Set(['PRINT']));
  const [finalReleaseBasis, setFinalReleaseBasis] = useState<StartListFinalReleaseBasisDto>('PROTESTS_CLEARED');

  return (
    <section className="space-y-3 rounded border border-vscode-border bg-vscode-bg p-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-[13px] font-semibold text-vscode-text">
            <FileCheck2 size={15} aria-hidden="true" /> Versioned Start Lists
          </h4>
          <p className="mt-1 text-xs leading-5 text-vscode-text-muted">
            ISSF 6.6.5 · snapshot, content approval, paperless approval, and actual distribution are separate records.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} aria-hidden="true" /> Refresh
        </Button>
      </header>

      {error && <InlineError>{error}</InlineError>}
      {sourceDirty && (
        <p className="border-l-2 border-vscode-warning pl-3 text-xs text-vscode-warning">
          Save the firing-point grid before creating a Start List version.
        </p>
      )}

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <StartListSelectField
          label="List kind"
          value={listKind}
          onChange={(value) => setListKind(value as StartListKindDto)}
          values={LIST_KINDS}
        />
        <StartListSelectField
          label="Discipline"
          value={disciplineGroup}
          onChange={(value) => setDisciplineGroup(value as StartListDisciplineGroupDto)}
          values={DISCIPLINE_GROUPS}
        />
        <StartListSelectField
          label="Distribution"
          value={distributionMode}
          onChange={(value) => {
            const mode = value as StartListDistributionModeDto;
            setDistributionMode(mode);
            setChannels(new Set(mode === 'PRINTED' ? ['PRINT'] : ['EMAIL', 'PUBLIC_INFORMATION_STATION']));
          }}
          values={DISTRIBUTION_MODES}
        />
        <label className={mutedLabelClass}>
          Scheduled start
          <input
            type="datetime-local"
            value={scheduledStartAt}
            onChange={(event) => setScheduledStartAt(event.target.value)}
            className={smallInputClass}
          />
        </label>
        <label className={mutedLabelClass}>
          Publication deadline
          <input
            type="datetime-local"
            value={publicationDueAt}
            onChange={(event) => setPublicationDueAt(event.target.value)}
            className={smallInputClass}
          />
        </label>
        <label className={mutedLabelClass}>
          Snapshot operator
          <input
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
            className={smallInputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || sourceDirty || !officialName.trim() || !scheduledStartAt || !publicationDueAt}
          onClick={() =>
            void commands.createVersion({
              listKind,
              disciplineGroup,
              distributionMode,
              scheduledStartAt,
              publicationDueAt,
              createdBy: officialName.trim(),
            })
          }
        >
          Create snapshot version
        </Button>
        {versions.length > 0 && (
          <select
            aria-label="Stored Start List version"
            value={selected?.id ?? ''}
            onChange={(event) => select(event.target.value)}
            className={compactSelectClass}
          >
            {versions.map((value) => (
              <option key={value.id} value={value.id}>
                {sentenceCaseLabel(value.listKind)} v{value.versionNumber} · {value.status}
                {value.isCurrent ? ' · CURRENT' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && (
        <StartListVersionDetail
          version={selected}
          busy={busy}
          sourceDirty={sourceDirty}
          officialRole={officialRole}
          onOfficialRoleChange={setOfficialRole}
          officialName={officialName}
          onOfficialNameChange={setOfficialName}
          statement={statement}
          onStatementChange={setStatement}
          channels={channels}
          onChannelChange={(value, included) => setChannels((current) => toggleSetMember(current, value, included))}
          finalReleaseBasis={finalReleaseBasis}
          onFinalReleaseBasisChange={setFinalReleaseBasis}
          commands={commands}
        />
      )}
    </section>
  );
}

function kindForRound(round: StartListPanelProps['round']): StartListKindDto {
  if (round === 'Elimination') return 'ELIMINATION';
  if (round === 'Qualification') return 'QUALIFICATION';
  if (round === 'Final') return 'FINAL';
  return 'OTHER';
}

function defaultScheduledStart(): string {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setHours(10, 0, 0, 0);
  return toDateTimeLocalValue(date, 'minutes');
}

function defaultPublicationDue(): string {
  const date = new Date();
  date.setHours(16, 0, 0, 0);
  return toDateTimeLocalValue(date, 'minutes');
}

const LIST_KINDS: readonly StartListKindDto[] = [
  'PRE_EVENT_TRAINING',
  'ELIMINATION',
  'QUALIFICATION',
  'FINAL',
  'OTHER',
];
const DISCIPLINE_GROUPS: readonly StartListDisciplineGroupDto[] = ['RIFLE_PISTOL', 'SHOTGUN', 'OTHER'];
const DISTRIBUTION_MODES: readonly StartListDistributionModeDto[] = ['PRINTED', 'PAPERLESS'];
const compactSelectClass = 'min-h-8 rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
