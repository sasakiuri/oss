import { useState, useCallback } from 'react';
import type { ShotDto } from '@/shared/ipc/contracts/laneControl.contract';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';

type ShotPhase = 'PREPARATION' | 'MATCH';

interface EditShotPayload {
  laneId: string;
  shotIndex: number;
  newScore: number;
  phase: ShotPhase;
}
interface DeleteShotPayload {
  laneId: string;
  shotIndex: number;
  phase: ShotPhase;
}
interface InsertShotPayload {
  laneId: string;
  shotIndex: number;
  score: number;
  phase: ShotPhase;
}

interface UseShotEditFormProps {
  laneId: string | null;
  activePhase: ShotPhase;
  shots: ShotDto[];
  editShot: (payload: EditShotPayload) => Promise<boolean>;
  deleteShot: (payload: DeleteShotPayload) => Promise<boolean>;
  insertShot: (payload: InsertShotPayload) => Promise<boolean>;
}

export function useShotEditForm({
  laneId,
  activePhase,
  shots,
  editShot,
  deleteShot,
  insertShot,
}: UseShotEditFormProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const [insertValue, setInsertValue] = useState<string>('');

  const handleEdit = useCallback((index: number, currentScore: number) => {
    setEditingIndex(index);
    setEditValue(currentScore.toFixed(1));
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingIndex === null || !laneId) return;
    const newScore = parseFloat(editValue);
    if (isNaN(newScore) || newScore < 0 || newScore > 10.9) return;
    await editShot({ laneId, shotIndex: editingIndex, newScore, phase: activePhase });
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, laneId, editValue, editShot, activePhase]);

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
  }, []);

  const handleDelete = useCallback(
    async (index: number) => {
      if (!laneId) return;
      const confirmed = await useConfirmDialogStore.getState().openConfirm('Delete this shot?');
      if (confirmed) {
        await deleteShot({ laneId, shotIndex: index, phase: activePhase });
      }
    },
    [laneId, deleteShot, activePhase],
  );

  const handleInsertStart = useCallback(() => {
    setInsertIndex(shots.length);
    setInsertValue('');
  }, [shots.length]);

  const handleInsertAtPosition = useCallback((index: number) => {
    setInsertIndex(index);
    setInsertValue('');
  }, []);

  const handleInsertSave = useCallback(async () => {
    if (insertIndex === null || !laneId) return;
    const score = parseFloat(insertValue);
    if (isNaN(score) || score < 0 || score > 10.9) return;
    await insertShot({ laneId, shotIndex: insertIndex, score, phase: activePhase });
    setInsertIndex(null);
    setInsertValue('');
  }, [insertIndex, laneId, insertValue, insertShot, activePhase]);

  const handleInsertCancel = useCallback(() => {
    setInsertIndex(null);
    setInsertValue('');
  }, []);

  return {
    editingIndex,
    editValue,
    setEditValue,
    insertIndex,
    insertValue,
    setInsertValue,
    handleEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleDelete,
    handleInsertStart,
    handleInsertAtPosition,
    handleInsertSave,
    handleInsertCancel,
  };
}
