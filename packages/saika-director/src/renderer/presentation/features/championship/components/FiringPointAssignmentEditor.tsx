import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Save } from 'lucide-react';
import { Button } from '../../shared/common/Button';
import { AssignmentGrid } from './AssignmentGrid';
import { ParticipantPool } from './ParticipantPool';
import { ConfigBar } from './ConfigBar';
import { useGridDragDrop } from '../../../hooks/useGridDragDrop';
import type { FiringPointAssignmentDto, ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

interface AssignmentRow {
  relayNumber: number;
  firingPointNumber: number;
  participantId: string;
}

interface FiringPointAssignmentEditorProps {
  assignments: FiringPointAssignmentDto[];
  participants: ParticipantDto[];
  onSave: (assignments: AssignmentRow[]) => Promise<boolean>;
}

interface GridState {
  relayCount: number;
  firingPointCount: number;
  grid: (string | null)[][];
}

export function FiringPointAssignmentEditor({ assignments, participants, onSave }: FiringPointAssignmentEditorProps) {
  const [gridState, setGridState] = useState<GridState>({
    relayCount: 1,
    firingPointCount: 1,
    grid: [[null]],
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editVersionRef = useRef(0);
  const isDirtyRef = useRef(false);
  const updateDirty = useCallback((dirty: boolean) => {
    if (dirty) editVersionRef.current += 1;
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const {
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
  } = useGridDragDrop({ gridState, setGridState, setIsDirty: updateDirty });

  // Initialize grid from props
  useEffect(() => {
    if (isDirtyRef.current) return;

    const relayCount = assignments.length > 0 ? Math.max(...assignments.map((a) => a.relayNumber)) : 1;
    const fpCount = assignments.length > 0 ? Math.max(...assignments.map((a) => a.firingPointNumber)) : 1;
    const grid: (string | null)[][] = Array.from({ length: relayCount }, () => Array(fpCount).fill(null));
    assignments.forEach((a) => {
      const relay = grid[a.relayNumber - 1];
      if (relay) relay[a.firingPointNumber - 1] = a.participantId;
    });
    setGridState({ relayCount, firingPointCount: fpCount, grid });
    editVersionRef.current += 1;
    updateDirty(false);
  }, [assignments, updateDirty]);

  const getParticipantName = useCallback(
    (id: string) => {
      const p = participants.find((pt) => pt.id === id);
      return p ? p.playerName : '?';
    },
    [participants],
  );

  const isParticipantAssigned = useMemo(() => {
    const { grid } = gridState;
    return (participantId: string): boolean => {
      return grid.some((relay) => relay.some((pid) => pid === participantId));
    };
  }, [gridState]);

  // ConfigBar handlers
  const handleRelayCountChange = useCallback(
    (newCount: number) => {
      if (newCount < 1) return;
      setGridState((prev) => {
        const { firingPointCount, grid } = prev;
        let newGrid: (string | null)[][];
        if (newCount > grid.length) {
          newGrid = [
            ...grid,
            ...Array.from({ length: newCount - grid.length }, () => Array(firingPointCount).fill(null)),
          ];
        } else {
          newGrid = grid.slice(0, newCount);
        }
        return { relayCount: newCount, firingPointCount, grid: newGrid };
      });
      updateDirty(true);
    },
    [updateDirty],
  );

  const handleFpCountChange = useCallback(
    (newCount: number) => {
      if (newCount < 1) return;
      setGridState((prev) => {
        const { relayCount, grid } = prev;
        const newGrid = grid.map((relay) => {
          if (newCount > relay.length) {
            return [...relay, ...Array(newCount - relay.length).fill(null)];
          } else {
            return relay.slice(0, newCount);
          }
        });
        return { relayCount, firingPointCount: newCount, grid: newGrid };
      });
      updateDirty(true);
    },
    [updateDirty],
  );

  // Save handler
  const handleSave = useCallback(async () => {
    const result: AssignmentRow[] = [];
    gridState.grid.forEach((relay, relayIdx) => {
      relay.forEach((pid, fpIdx) => {
        if (pid) {
          result.push({ relayNumber: relayIdx + 1, firingPointNumber: fpIdx + 1, participantId: pid });
        }
      });
    });
    const submittedVersion = editVersionRef.current;
    setIsSaving(true);
    try {
      const saved = await onSave(result);
      if (saved && submittedVersion === editVersionRef.current) updateDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [gridState.grid, onSave, updateDirty]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-vscode-text">Firing-point grid</h4>
        {isDirty && (
          <Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
            <Save size={13} aria-hidden="true" />
            Save
          </Button>
        )}
      </div>

      <ConfigBar
        relayCount={gridState.relayCount}
        firingPointCount={gridState.firingPointCount}
        onRelayCountChange={handleRelayCountChange}
        onFiringPointCountChange={handleFpCountChange}
      />

      <AssignmentGrid
        gridState={gridState}
        dragOverCell={dragOverCell}
        dragOverValid={dragOverValid}
        getParticipantName={getParticipantName}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onCellClick={handleCellClick}
      />

      <ParticipantPool
        participants={participants}
        draggingParticipantId={draggingParticipantId}
        isParticipantAssigned={isParticipantAssigned}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    </div>
  );
}
