import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '../../shared/common/Button';
import { ParticipantRow as ParticipantRowComponent } from './ParticipantRow';
import type { ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

interface ParticipantRow {
  id?: string;
  tempId: string;
  playerName: string;
  affiliation: string;
}

interface ParticipantEditorProps {
  participants: ParticipantDto[];
  onSave: (
    participants: { id?: string; playerName: string; affiliation: string }[],
  ) => Promise<ParticipantDto[] | null>;
}

function parseClipboardText(text: string): ParticipantRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('\t');
      return {
        tempId: crypto.randomUUID(),
        playerName: (parts[0] ?? '').trim(),
        affiliation: (parts[1] ?? '').trim(),
      };
    })
    .filter((row) => row.playerName !== '');
}

export function ParticipantEditor({ participants, onSave }: ParticipantEditorProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const editVersionRef = useRef(0);
  const isDirtyRef = useRef(false);

  const updateDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const markDirty = useCallback(() => {
    editVersionRef.current += 1;
    updateDirty(true);
  }, [updateDirty]);

  useEffect(() => {
    if (isDirtyRef.current) return;

    setRows(
      participants.map((p) => ({
        id: p.id,
        tempId: crypto.randomUUID(),
        playerName: p.playerName,
        affiliation: p.affiliation,
      })),
    );
    editVersionRef.current += 1;
    updateDirty(false);
  }, [participants, updateDirty]);

  const addRow = () => {
    setRows([...rows, { id: undefined, tempId: crypto.randomUUID(), playerName: '', affiliation: '' }]);
    markDirty();
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    markDirty();
  };

  const updateRow = useCallback(
    (index: number, field: keyof ParticipantRow, value: string) => {
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
      markDirty();
    },
    [markDirty],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const parsed = parseClipboardText(text);
    if (parsed.length > 0) {
      setRows((prev) => [...prev, ...parsed]);
      markDirty();
    }
  };

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.playerName.trim());
    const submittedVersion = editVersionRef.current;
    setIsSaving(true);
    try {
      const savedParticipants = await onSave(
        validRows.map(({ id, playerName, affiliation }) => ({ id, playerName, affiliation })),
      );
      if (!savedParticipants) return;

      if (submittedVersion === editVersionRef.current) {
        setRows(
          savedParticipants.map((participant, index) => ({
            id: participant.id,
            tempId: validRows[index]?.tempId ?? crypto.randomUUID(),
            playerName: participant.playerName,
            affiliation: participant.affiliation,
          })),
        );
        updateDirty(false);
        return;
      }

      const persistedIds = new Map(validRows.map((row, index) => [row.tempId, savedParticipants[index]?.id] as const));
      setRows((currentRows) =>
        currentRows.map((row) => {
          const persistedId = persistedIds.get(row.tempId);
          return persistedId ? { ...row, id: persistedId } : row;
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      setRows((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        const toIndex = dragIndex < index ? index - 1 : index;
        updated.splice(toIndex, 0, moved!);
        return updated;
      });
      markDirty();
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3" onPaste={handlePaste} tabIndex={0}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-semibold text-vscode-text">Entry list</h4>
          <p className="mt-0.5 text-xs text-vscode-text-muted">{rows.length} athletes</p>
        </div>
        {isDirty && (
          <Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
            <Save size={13} aria-hidden="true" />
            Save
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="border-y border-vscode-border py-4 text-[13px] text-vscode-text-muted">No athletes entered.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-vscode-border">
                <th className="w-6 px-1 py-1.5"></th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Athlete</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Affiliation</th>
                <th className="w-8 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <ParticipantRowComponent
                  key={row.id ?? row.tempId}
                  row={row}
                  index={index}
                  isDragging={dragIndex === index}
                  isDragOver={dragOverIndex === index && dragIndex !== index}
                  onUpdate={updateRow}
                  onRemove={removeRow}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-xs text-vscode-dimmed">Paste two columns from a spreadsheet: athlete and affiliation.</p>
        <Button size="sm" variant="secondary" onClick={addRow}>
          <Plus size={13} aria-hidden="true" />
          Add athlete
        </Button>
      </div>
    </div>
  );
}
