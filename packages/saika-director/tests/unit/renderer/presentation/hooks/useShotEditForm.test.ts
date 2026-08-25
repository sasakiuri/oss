import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShotEditForm } from '@/renderer/presentation/hooks/useShotEditForm';
import type { ShotDto } from '@/shared/ipc/contracts/laneControl.contract';

const { mockOpenConfirm } = vi.hoisted(() => ({ mockOpenConfirm: vi.fn() }));

vi.mock('@/renderer/presentation/stores/ui/confirmDialog.store', () => ({
  useConfirmDialogStore: {
    getState: () => ({ openConfirm: mockOpenConfirm }),
  },
}));

function createShot(overrides: Partial<ShotDto> = {}): ShotDto {
  return { shotNumber: 1, score: 10.0, seriesNumber: 1, ...overrides };
}

describe('useShotEditForm', () => {
  const mockEditShot = vi.fn().mockResolvedValue(true);
  const mockDeleteShot = vi.fn().mockResolvedValue(true);
  const mockInsertShot = vi.fn().mockResolvedValue(true);

  const defaultProps = {
    laneId: 'lane-1',
    activePhase: 'MATCH' as const,
    shots: [createShot({ shotNumber: 1, score: 10.0 }), createShot({ shotNumber: 2, score: 9.5 })],
    editShot: mockEditShot,
    deleteShot: mockDeleteShot,
    insertShot: mockInsertShot,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenConfirm.mockResolvedValue(true);
  });

  describe('initial state', () => {
    it('should have null editingIndex', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));
      expect(result.current.editingIndex).toBeNull();
    });

    it('should have empty editValue', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));
      expect(result.current.editValue).toBe('');
    });

    it('should have null insertIndex', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));
      expect(result.current.insertIndex).toBeNull();
    });
  });

  describe('handleEdit', () => {
    it('should set editingIndex and editValue', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.5);
      });

      expect(result.current.editingIndex).toBe(0);
      expect(result.current.editValue).toBe('10.5');
    });
  });

  describe('handleSaveEdit', () => {
    it('should call editShot with correct payload', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('9.8');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).toHaveBeenCalledWith({
        laneId: 'lane-1',
        shotIndex: 0,
        newScore: 9.8,
        phase: 'MATCH',
      });
    });

    it('should reset editing state after save', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('9.5');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(result.current.editingIndex).toBeNull();
      expect(result.current.editValue).toBe('');
    });

    it('should not save if no editingIndex', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).not.toHaveBeenCalled();
    });

    it('should not save if invalid score (NaN)', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('abc');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).not.toHaveBeenCalled();
    });

    it('should not save if score > 10.9', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('11.0');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).not.toHaveBeenCalled();
    });

    it('should not save if score < 0', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('-1');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).not.toHaveBeenCalled();
    });

    it('should not save if laneId is null', async () => {
      const { result } = renderHook(() => useShotEditForm({ ...defaultProps, laneId: null }));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.setEditValue('9.0');
      });

      await act(async () => {
        await result.current.handleSaveEdit();
      });

      expect(mockEditShot).not.toHaveBeenCalled();
    });
  });

  describe('handleCancelEdit', () => {
    it('should reset editing state', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleEdit(0, 10.0);
      });

      act(() => {
        result.current.handleCancelEdit();
      });

      expect(result.current.editingIndex).toBeNull();
      expect(result.current.editValue).toBe('');
    });
  });

  describe('handleDelete', () => {
    it('should call deleteShot when confirmed', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      await act(async () => {
        await result.current.handleDelete(1);
      });

      expect(mockDeleteShot).toHaveBeenCalledWith({
        laneId: 'lane-1',
        shotIndex: 1,
        phase: 'MATCH',
      });
    });

    it('should not delete if laneId is null', async () => {
      const { result } = renderHook(() => useShotEditForm({ ...defaultProps, laneId: null }));

      await act(async () => {
        await result.current.handleDelete(0);
      });

      expect(mockDeleteShot).not.toHaveBeenCalled();
    });

    it('should not delete when confirmation is cancelled', async () => {
      mockOpenConfirm.mockResolvedValue(false);
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      await act(async () => {
        await result.current.handleDelete(0);
      });

      expect(mockDeleteShot).not.toHaveBeenCalled();
    });
  });

  describe('handleInsertStart', () => {
    it('should set insertIndex to shots length', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertStart();
      });

      expect(result.current.insertIndex).toBe(2); // shots.length
      expect(result.current.insertValue).toBe('');
    });
  });

  describe('handleInsertAtPosition', () => {
    it('should set insertIndex to specified position', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertAtPosition(1);
      });

      expect(result.current.insertIndex).toBe(1);
    });
  });

  describe('handleInsertSave', () => {
    it('should call insertShot with correct payload', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertStart();
      });

      act(() => {
        result.current.setInsertValue('10.3');
      });

      await act(async () => {
        await result.current.handleInsertSave();
      });

      expect(mockInsertShot).toHaveBeenCalledWith({
        laneId: 'lane-1',
        shotIndex: 2,
        score: 10.3,
        phase: 'MATCH',
      });
    });

    it('should reset insert state after save', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertStart();
        result.current.setInsertValue('10.0');
      });

      await act(async () => {
        await result.current.handleInsertSave();
      });

      expect(result.current.insertIndex).toBeNull();
      expect(result.current.insertValue).toBe('');
    });

    it('should not save if invalid score', async () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertStart();
        result.current.setInsertValue('invalid');
      });

      await act(async () => {
        await result.current.handleInsertSave();
      });

      expect(mockInsertShot).not.toHaveBeenCalled();
    });
  });

  describe('handleInsertCancel', () => {
    it('should reset insert state', () => {
      const { result } = renderHook(() => useShotEditForm(defaultProps));

      act(() => {
        result.current.handleInsertStart();
        result.current.setInsertValue('10.0');
      });

      act(() => {
        result.current.handleInsertCancel();
      });

      expect(result.current.insertIndex).toBeNull();
      expect(result.current.insertValue).toBe('');
    });
  });
});
