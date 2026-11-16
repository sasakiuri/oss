import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useEntryTypeSelection } from '@/renderer/presentation/features/shared/cases/useEntryTypeSelection';

type EntryType = 'NOTE' | 'REFERRED' | 'RESOLVED' | 'CLOSED';

function renderSelection(initial: readonly EntryType[]) {
  return renderHook(({ options }) => useEntryTypeSelection<EntryType>(options, 'NOTE'), {
    initialProps: { options: initial },
  });
}

describe('useEntryTypeSelection', () => {
  it('starts at the first allowed type', () => {
    const { result } = renderSelection(['REFERRED', 'NOTE']);
    expect(result.current[0]).toBe('REFERRED');
  });

  it('starts at the fallback when no type is allowed', () => {
    const { result } = renderSelection([]);
    expect(result.current[0]).toBe('NOTE');
  });

  it('keeps a chosen type while the case still allows it', () => {
    const { result, rerender } = renderSelection(['NOTE', 'REFERRED', 'RESOLVED']);
    act(() => result.current[1]('RESOLVED'));
    rerender({ options: ['NOTE', 'RESOLVED'] });
    expect(result.current[0]).toBe('RESOLVED');
  });

  it('resets to the first allowed type when the chosen type is no longer allowed', () => {
    const { result, rerender } = renderSelection(['NOTE', 'REFERRED', 'RESOLVED']);
    act(() => result.current[1]('REFERRED'));
    rerender({ options: ['CLOSED', 'NOTE'] });
    expect(result.current[0]).toBe('CLOSED');
  });

  it('resets to the fallback when the case allows no type any more', () => {
    const { result, rerender } = renderSelection(['NOTE', 'REFERRED']);
    act(() => result.current[1]('REFERRED'));
    rerender({ options: [] });
    expect(result.current[0]).toBe('NOTE');
  });
});
