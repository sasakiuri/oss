import { useState } from 'react';

import type { AsyncAction } from '@/renderer/presentation/hooks/useAsyncAction';
import { adjudicationCasesService } from '@/renderer/services';
import { unwrap } from '@/renderer/services/serviceError';
import type { AdjudicationCaseDto } from '@/shared/ipc/contracts';

import { Button } from '../shared/common/Button';
import { paddedInputClass } from '../shared/common/formClasses';

/** Opens a case file in the event. The category and official name stay for the next case. */
export function CreateAdjudicationCaseForm({
  eventId,
  disabled,
  run,
  onCreated,
}: {
  eventId: string;
  disabled: boolean;
  run: AsyncAction['run'];
  onCreated: (value: AdjudicationCaseDto) => void;
}) {
  const [category, setCategory] = useState<AdjudicationCaseDto['category']>('RANGE_INCIDENT');
  const [subject, setSubject] = useState('');
  const [summary, setSummary] = useState('');
  const [officialName, setOfficialName] = useState('');

  return (
    <form
      className="rounded-[3px] border border-vscode-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const created = unwrap(
            await adjudicationCasesService.create({
              scopeType: 'EVENT',
              scopeId: eventId,
              category,
              subject,
              summary,
              openedBy: officialName,
            }),
          );
          onCreated(created);
          setSubject('');
          setSummary('');
        });
      }}
    >
      <p className="text-xs font-semibold text-vscode-text">Open an optional case file</p>
      <div className="mt-2 grid gap-2 md:grid-cols-4">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
          className={paddedInputClass}
        >
          {CASE_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
        <input
          className={paddedInputClass}
          placeholder="Subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <input
          className={paddedInputClass}
          placeholder="Summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
        <input
          className={paddedInputClass}
          placeholder="Official name"
          value={officialName}
          onChange={(event) => setOfficialName(event.target.value)}
        />
      </div>
      <Button
        className="mt-2"
        size="sm"
        disabled={disabled || !subject.trim() || !summary.trim() || !officialName.trim()}
      >
        Open case
      </Button>
    </form>
  );
}

const CASE_CATEGORIES: readonly AdjudicationCaseDto['category'][] = [
  'SCORING',
  'RANGE_INCIDENT',
  'PROTEST',
  'MALFUNCTION',
  'TARGET_FAILURE',
  'COMMAND_ERROR',
  'FINAL',
  'OTHER',
];
