import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockToggleSelect = vi.fn();
const mockSelectAll = vi.fn();
const mockDeselectAll = vi.fn();
const mockIsSelected = vi.fn();
let mockSelectedIds = new Set<string>();

vi.mock('@/renderer/presentation/stores/ui/selection.store', () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) => {
    const mockState = {
      selectedIds: mockSelectedIds,
      toggleSelect: mockToggleSelect,
      selectAll: mockSelectAll,
      deselectAll: mockDeselectAll,
      isSelected: mockIsSelected,
    };
    return selector(mockState);
  },
}));

import { useSelection } from '@/renderer/presentation/hooks/useSelection';

describe('useSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedIds = new Set<string>();
  });

  it('should return selectedIds from store', () => {
    mockSelectedIds = new Set(['id-1', 'id-2']);
    const { result } = renderHook(() => useSelection());
    expect(result.current.selectedIds).toEqual(new Set(['id-1', 'id-2']));
  });

  it('should expose toggleSelect', () => {
    const { result } = renderHook(() => useSelection());
    result.current.toggleSelect('id-1');
    expect(mockToggleSelect).toHaveBeenCalledWith('id-1');
  });

  it('should expose selectAll that takes a map', () => {
    const { result } = renderHook(() => useSelection());
    const map = new Map([['id-1', {}]]);
    result.current.selectAll(map);
    expect(mockSelectAll).toHaveBeenCalledWith(map);
  });

  it('should expose deselectAll', () => {
    const { result } = renderHook(() => useSelection());
    result.current.deselectAll();
    expect(mockDeselectAll).toHaveBeenCalled();
  });

  it('should expose isSelected', () => {
    mockIsSelected.mockReturnValue(true);
    const { result } = renderHook(() => useSelection());
    expect(result.current.isSelected('id-1')).toBe(true);
    expect(mockIsSelected).toHaveBeenCalledWith('id-1');
  });

  it('should return false for non-selected id', () => {
    mockIsSelected.mockReturnValue(false);
    const { result } = renderHook(() => useSelection());
    expect(result.current.isSelected('missing')).toBe(false);
  });
});
