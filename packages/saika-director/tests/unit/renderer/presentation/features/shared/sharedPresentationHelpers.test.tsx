import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { toDateTimeLocalValue } from '@/renderer/presentation/features/shared/common/dateUtils';
import { InlineError } from '@/renderer/presentation/features/shared/common/InlineError';
import { toggleSetMember } from '@/renderer/presentation/features/shared/common/toggleSetMember';
import { firingPointLabel, laneLabel, laneLabelById } from '@/renderer/presentation/features/shared/lanes/laneLabels';
import { lowerCaseLabel, sentenceCaseLabel, titleCaseLabel } from '@/renderer/presentation/formatters/enumLabel';
import type { DirectorLaneSnapshotDto } from '@/shared/ipc/contracts';

describe('toDateTimeLocalValue', () => {
  it('matches the local datetime-local value the panels computed by hand', () => {
    const date = new Date(2026, 10, 16, 9, 5, 7, 450);
    const byHand = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();

    expect(toDateTimeLocalValue(date, 'minutes')).toBe(byHand.slice(0, 16));
    expect(toDateTimeLocalValue(date, 'seconds')).toBe(byHand.slice(0, 19));
    expect(toDateTimeLocalValue(date, 'minutes')).toBe('2026-11-16T09:05');
    expect(toDateTimeLocalValue(date, 'seconds')).toBe('2026-11-16T09:05:07');
  });
});

describe('enum labels', () => {
  it.each([
    ['FIRING_POINT_FAILURE', 'Firing point failure', 'Firing Point Failure', 'firing point failure'],
    ['OPEN', 'Open', 'Open', 'open'],
    ['A__B', 'A  b', 'A  B', 'a  b'],
    ['', '', '', ''],
  ])('labels %j in the three variants', (value, sentence, title, lower) => {
    expect(sentenceCaseLabel(value)).toBe(sentence);
    expect(titleCaseLabel(value)).toBe(title);
    expect(lowerCaseLabel(value)).toBe(lower);
  });
});

describe('lane labels', () => {
  const lane = (overrides: Partial<DirectorLaneSnapshotDto>) =>
    ({
      laneId: 'abcdef12-3456-4789-8abc-def012345678',
      firingPointNumber: null,
      laneAlias: '',
      ...overrides,
    }) as DirectorLaneSnapshotDto;

  it('prefers the firing point, then the alias, then the short Lane id', () => {
    expect(firingPointLabel(lane({ firingPointNumber: 4, laneAlias: 'North' }))).toBe('FP 4');
    expect(firingPointLabel(lane({ laneAlias: 'North' }))).toBe('North');
    expect(firingPointLabel(lane({}))).toBe('abcdef12');
  });

  it('adds the assigned athlete and falls back to the short id for an unknown Lane', () => {
    const assigned = lane({
      firingPointNumber: 2,
      assignment: { athlete: { name: 'Alex Smith' } } as DirectorLaneSnapshotDto['assignment'],
    });
    expect(laneLabel(assigned)).toBe('FP 2 · Alex Smith');
    expect(laneLabelById([assigned], assigned.laneId)).toBe('FP 2 · Alex Smith');
    expect(laneLabelById([assigned], '99999999-0000-4000-8000-000000000000')).toBe('99999999');
  });
});

describe('toggleSetMember', () => {
  it('returns a new set with the value added or removed', () => {
    const current = new Set(['a']);
    expect(toggleSetMember(current, 'b', true)).toEqual(new Set(['a', 'b']));
    expect(toggleSetMember(current, 'a', false)).toEqual(new Set());
    expect(current).toEqual(new Set(['a']));
  });
});

describe('InlineError', () => {
  it('renders the three banner variants panels use', () => {
    const { container } = render(
      <>
        <InlineError>Paragraph</InlineError>
        <InlineError as="div" size="13px">
          Block
        </InlineError>
        <InlineError as="div" role="alert">
          Alert
        </InlineError>
      </>,
    );
    expect(container.innerHTML).toBe(
      '<p class="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">Paragraph</p>' +
        '<div class="border-l-2 border-vscode-error pl-3 text-[13px] text-vscode-error">Block</div>' +
        '<div role="alert" class="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">Alert</div>',
    );
  });
});
