import { useState, useCallback } from 'react';

interface GridState {
  relayCount: number;
  firingPointCount: number;
  grid: (string | null)[][];
}

export interface DragSource {
  relayIdx: number;
  fpIdx: number;
}

interface DragOverCell {
  relayIdx: number;
  fpIdx: number;
}

export function isParticipantDropValid(
  grid: (string | null)[][],
  participantId: string,
  relayIdx: number,
  fpIdx: number,
  source: DragSource | null,
): boolean {
  const targetRelay = grid[relayIdx];
  if (!targetRelay || fpIdx < 0 || fpIdx >= targetRelay.length) return false;
  if (source?.relayIdx === relayIdx && source.fpIdx === fpIdx) return true;

  const nextGrid = grid.map((relay) => [...relay]);
  const nextTargetRelay = nextGrid[relayIdx]!;
  const targetParticipantId = nextTargetRelay[fpIdx] ?? null;
  nextTargetRelay[fpIdx] = participantId;

  if (source) {
    const sourceRelay = nextGrid[source.relayIdx];
    if (!sourceRelay || source.fpIdx < 0 || source.fpIdx >= sourceRelay.length) return false;
    sourceRelay[source.fpIdx] = targetParticipantId;
  }

  const participantCounts = new Map<string, number>();
  for (const relay of nextGrid) {
    for (const assignedParticipantId of relay) {
      if (!assignedParticipantId) continue;
      participantCounts.set(assignedParticipantId, (participantCounts.get(assignedParticipantId) ?? 0) + 1);
    }
  }

  if ((participantCounts.get(participantId) ?? 0) > 1) return false;
  return targetParticipantId === null || (participantCounts.get(targetParticipantId) ?? 0) <= 1;
}

interface UseGridDragDropProps {
  gridState: GridState;
  setGridState: React.Dispatch<React.SetStateAction<GridState>>;
  setIsDirty: (dirty: boolean) => void;
}

export function useGridDragDrop({ gridState, setGridState, setIsDirty }: UseGridDragDropProps) {
  const [dragOverCell, setDragOverCell] = useState<DragOverCell | null>(null);
  const [dragOverValid, setDragOverValid] = useState(false);
  const [draggingParticipantId, setDraggingParticipantId] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, participantId: string, source?: DragSource) => {
    e.dataTransfer.setData('text/plain', participantId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingParticipantId(participantId);
    setDragSource(source ?? null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingParticipantId(null);
    setDragSource(null);
    setDragOverCell(null);
    setDragOverValid(false);
  }, []);

  const isDropValid = useCallback(
    (relayIdx: number, fpIdx: number): boolean => {
      const participantId = draggingParticipantId;
      if (!participantId) return false;
      return isParticipantDropValid(gridState.grid, participantId, relayIdx, fpIdx, dragSource);
    },
    [draggingParticipantId, dragSource, gridState.grid],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, relayIdx: number, fpIdx: number) => {
      if (!draggingParticipantId) return;

      const valid = isDropValid(relayIdx, fpIdx);
      if (valid) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
      setDragOverCell({ relayIdx, fpIdx });
      setDragOverValid(valid);
    },
    [draggingParticipantId, isDropValid],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent, relayIdx: number, fpIdx: number) => {
      e.preventDefault();
      if (!draggingParticipantId) return;

      const valid = isDropValid(relayIdx, fpIdx);
      setDragOverCell({ relayIdx, fpIdx });
      setDragOverValid(valid);
    },
    [draggingParticipantId, isDropValid],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverCell(null);
      setDragOverValid(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, relayIdx: number, fpIdx: number) => {
      e.preventDefault();
      const participantId = e.dataTransfer.getData('text/plain');
      if (!participantId) return;

      if (!isDropValid(relayIdx, fpIdx)) return;

      setGridState((prev) => {
        const newGrid = prev.grid.map((relay) => [...relay]);
        const targetRelay = newGrid[relayIdx];
        if (!targetRelay) return prev;

        const targetPid = targetRelay[fpIdx] ?? null;

        // Place dragged participant in target
        targetRelay[fpIdx] = participantId;

        // If dragged from a grid cell, handle source
        if (dragSource) {
          const sourceRelay = newGrid[dragSource.relayIdx];
          if (sourceRelay) {
            // Swap: place target's previous occupant in source cell
            sourceRelay[dragSource.fpIdx] = targetPid;
          }
        }

        return { ...prev, grid: newGrid };
      });
      setIsDirty(true);
      setDragOverCell(null);
      setDragOverValid(false);
      setDraggingParticipantId(null);
      setDragSource(null);
    },
    [dragSource, isDropValid, setGridState, setIsDirty],
  );

  const handleCellClick = useCallback(
    (relayIdx: number, fpIdx: number) => {
      setGridState((prev) => {
        const relay = prev.grid[relayIdx];
        if (!relay || !relay[fpIdx]) return prev;
        const newGrid = prev.grid.map((r) => [...r]);
        const targetRelay = newGrid[relayIdx];
        if (targetRelay) targetRelay[fpIdx] = null;
        return { ...prev, grid: newGrid };
      });
      setIsDirty(true);
    },
    [setGridState, setIsDirty],
  );

  return {
    dragOverCell,
    dragOverValid,
    draggingParticipantId,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleCellClick,
  };
}
